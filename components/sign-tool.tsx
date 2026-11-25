"use client";

/* PDF pages, handwriting, and seals are drawn in the browser as data URLs. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { Download, Redo2, Trash2, Undo2, Upload } from "lucide-react";
import { downloadBytes, formatBytes, makeId } from "@/lib/pdf-tools";
import { sealGraphemes } from "@/lib/seal-layout";
import {
  fitPlacement,
  placementHeightFraction,
  resizePlacement,
  type ResizeCorner
} from "@/lib/sign-geometry";
import { SEAL_FONT, SIGNATURE_FONTS, loadSignFonts, type SignatureFontId } from "@/lib/sign-fonts";
import {
  INK_COLORS,
  canvasToTrimmedPng,
  paintStrokes,
  renderSeal,
  renderSignature,
  type DrawStroke,
  type InkName,
  type RasterImage,
  type SealShape
} from "@/lib/sign-render";
import {
  downloadDataUrl,
  embedPlacements,
  loadSignDocument,
  signedPdfFilename,
  type SignPage,
  type SignPlacement
} from "@/lib/sign-pdf";

type Mode = "signature" | "stamp" | "draw";
type Mark = SignPlacement & { id: string; groupId: string };
type Asset = RasterImage & { kind: Mode };
type Result = { filename: string; bytes: Uint8Array };

const DRAW_WIDTH = 1200;
const DRAW_HEIGHT = 380;

export default function SignTool({ active }: { active: boolean }) {
  const [fontsReady, setFontsReady] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<SignPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [placements, setPlacements] = useState<Mark[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("signature");
  const [name, setName] = useState("홍길동");
  const [ink, setInk] = useState<InkName>("black");
  const [fontId, setFontId] = useState<SignatureFontId>("pen");
  const [shape, setShape] = useState<SealShape>("round");
  const [texture, setTexture] = useState(true);
  const [suffixIn, setSuffixIn] = useState(false);
  const [penSize, setPenSize] = useState(8);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [fontCards, setFontCards] = useState<Partial<Record<SignatureFontId, string>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const strokesRef = useRef<DrawStroke[]>([]);
  const drawingRef = useRef<DrawStroke & { pointerId: number } | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const tapRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const page = pages[currentPage] ?? null;
  const sealCount = sealGraphemes(name).length;
  const pageMarks = placements.filter((item) => item.pageIndex === currentPage);

  useEffect(() => {
    if (!active || fontsReady) return;
    let cancelled = false;
    loadSignFonts()
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "글꼴을 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, fontsReady]);

  useEffect(() => {
    if (!fontsReady || mode === "draw") return;
    if (mode === "signature") {
      const sample = name.trim() || "홍길동";
      const cards: Partial<Record<SignatureFontId, string>> = {};
      for (const font of SIGNATURE_FONTS) {
        const preview = renderSignature(sample, font.family, font.weight, INK_COLORS[ink]);
        if (preview) cards[font.id] = preview.dataUrl;
      }
      setFontCards(cards);
      const selected = SIGNATURE_FONTS.find((font) => font.id === fontId) ?? SIGNATURE_FONTS[0];
      const rendered = name.trim()
        ? renderSignature(name, selected.family, selected.weight, INK_COLORS[ink])
        : null;
      setAsset(rendered ? { ...rendered, kind: "signature" } : null);
      return;
    }

    const rendered = renderSeal({
      name,
      shape,
      texture,
      suffixIn: suffixIn && sealCount === 3,
      family: SEAL_FONT.family,
      weight: SEAL_FONT.weight
    });
    setAsset(rendered ? { ...rendered, kind: "stamp" } : null);
  }, [fontId, fontsReady, ink, mode, name, sealCount, shape, suffixIn, texture]);

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = drawRef.current;
    if (!canvas) return;
    paintStrokes(canvas, strokes);
    const trimmed = canvasToTrimmedPng(canvas);
    setAsset(trimmed ? { ...trimmed, kind: "draw" } : null);
  }, [mode, strokes]);

  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!selectedId) return;
      event.preventDefault();
      setPlacements((items) => items.filter((item) => item.id !== selectedId));
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedId]);

  useEffect(() => {
    if (!result) {
      setPreviewUrl(null);
      return;
    }
    const buffer = new ArrayBuffer(result.bytes.byteLength);
    new Uint8Array(buffer).set(result.bytes);
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  async function openPdf(files: File[]) {
    const file = files.find((item) => item.type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf"));
    if (fileRef.current) fileRef.current.value = "";
    if (!file) {
      setMessage("PDF 파일만 열 수 있습니다.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const loaded = await loadSignDocument(file);
      setPdfBytes(loaded.bytes);
      setPages(loaded.pages);
      setFileName(file.name);
      setFileSize(file.size);
      setCurrentPage(0);
      setPlacements([]);
      setSelectedId(null);
      setMessage(`${loaded.pages.length}쪽을 불러왔습니다. 페이지를 눌러 서명이나 도장을 놓으세요.`);
    } catch (error) {
      setPdfBytes(null);
      setPages([]);
      setFileName(null);
      setMessage(error instanceof Error ? error.message : "PDF를 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function showPage(index: number) {
    setCurrentPage(index);
    setSelectedId(null);
  }

  function pagePoint(clientX: number, clientY: number) {
    const image = imageRef.current;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  }

  function placeAt(clientX: number, clientY: number) {
    if (!page || !asset) {
      setMessage("놓을 서명이나 도장을 먼저 만들어 주세요.");
      return;
    }
    const point = pagePoint(clientX, clientY);
    if (!point) return;
    const width = asset.kind === "stamp" ? 0.18 : 0.34;
    const aspect = asset.width / asset.height;
    const height = placementHeightFraction(width, aspect, page.visualWidth, page.visualHeight);
    const fitted = fitPlacement({
      x: point.x - width / 2,
      y: point.y - height / 2,
      w: width,
      h: height
    });
    const id = makeId();
    setPlacements((items) => [
      ...items,
      {
        id,
        groupId: id,
        pageIndex: page.pageIndex,
        dataUrl: asset.dataUrl,
        aspect,
        x: fitted.x,
        y: fitted.y,
        w: fitted.w
      }
    ]);
    setSelectedId(id);
    setResult(null);
    setMessage(null);
  }

  function beginMove(event: React.PointerEvent<HTMLElement>, mark: Mark) {
    if (!page) return;
    event.stopPropagation();
    event.preventDefault();
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    const height = placementHeightFraction(mark.w, mark.aspect, page.visualWidth, page.visualHeight);
    dragRef.current = {
      pointerId: event.pointerId,
      id: mark.id,
      mode: "move",
      origin: { x: mark.x, y: mark.y, w: mark.w, h: height },
      pointerX: point.x,
      pointerY: point.y,
      aspect: mark.aspect,
      pageWidth: page.visualWidth,
      pageHeight: page.visualHeight
    };
    setSelectedId(mark.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, mark: Mark, corner: ResizeCorner) {
    if (!page) return;
    event.stopPropagation();
    event.preventDefault();
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    const height = placementHeightFraction(mark.w, mark.aspect, page.visualWidth, page.visualHeight);
    dragRef.current = {
      pointerId: event.pointerId,
      id: mark.id,
      mode: "resize",
      corner,
      origin: { x: mark.x, y: mark.y, w: mark.w, h: height },
      pointerX: point.x,
      pointerY: point.y,
      aspect: mark.aspect,
      pageWidth: page.visualWidth,
      pageHeight: page.visualHeight
    };
    setSelectedId(mark.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pagePoint(event.clientX, event.clientY);
    if (!point) return;
    const next = drag.mode === "move"
      ? fitPlacement({
        x: drag.origin.x + (point.x - drag.pointerX),
        y: drag.origin.y + (point.y - drag.pointerY),
        w: drag.origin.w,
        h: drag.origin.h
      })
      : resizePlacement({
        corner: drag.corner ?? "se",
        pointerX: point.x,
        pointerY: point.y,
        origin: drag.origin,
        aspect: drag.aspect,
        pageWidth: drag.pageWidth,
        pageHeight: drag.pageHeight
      });
    setPlacements((items) => items.map((item) => (
      item.id === drag.id ? { ...item, x: next.x, y: next.y, w: next.w } : item
    )));
    setResult(null);
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function applyToAll() {
    const selected = placements.find((item) => item.id === selectedId);
    if (!selected || pages.length === 0) {
      setMessage("먼저 페이지 위의 서명을 선택한 뒤 모든 페이지에 복제하세요.");
      return;
    }
    setPlacements((items) => {
      const kept = items.filter((item) => item.groupId !== selected.groupId);
      const clones = pages.map((item) => ({
        ...selected,
        id: item.pageIndex === selected.pageIndex ? selected.id : makeId(),
        pageIndex: item.pageIndex
      }));
      return [...kept, ...clones];
    });
    setResult(null);
    setMessage("모든 페이지의 같은 위치에 놓았습니다.");
  }

  function removeSelected() {
    if (!selectedId) return;
    setPlacements((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
    setResult(null);
  }

  async function savePdf() {
    if (!pdfBytes || !fileName) {
      setMessage("PDF를 먼저 열어 주세요.");
      return;
    }
    if (placements.length === 0) {
      setMessage("페이지에 서명이나 도장을 먼저 놓아 주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const bytes = await embedPlacements(pdfBytes, pages, placements);
      setResult({ filename: signedPdfFilename(fileName), bytes });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function savePng() {
    if (!asset) {
      setMessage("저장할 서명이나 도장을 먼저 만들어 주세요.");
      return;
    }
    const label = asset.kind === "stamp" ? "도장" : "서명";
    downloadDataUrl(asset.dataUrl, `${label}.png`);
  }

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function paintLive(extra?: DrawStroke) {
    const canvas = drawRef.current;
    if (!canvas) return;
    paintStrokes(canvas, extra ? [...strokesRef.current, extra] : strokesRef.current);
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const stroke = {
      pointerId: event.pointerId,
      color: INK_COLORS[ink],
      width: penSize,
      points: [canvasPoint(event)]
    };
    drawingRef.current = stroke;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintLive(stroke);
  }

  function moveStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawingRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    stroke.points.push(canvasPoint(event));
    paintLive(stroke);
  }

  function finishStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawingRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    drawingRef.current = null;
    if (stroke.points.length < 2) {
      paintLive();
      return;
    }
    const next = [...strokesRef.current, { color: stroke.color, width: stroke.width, points: stroke.points }];
    strokesRef.current = next;
    setStrokes(next);
  }

  function undoStroke() {
    const next = strokesRef.current.slice(0, -1);
    strokesRef.current = next;
    setStrokes(next);
  }

  function clearStrokes() {
    strokesRef.current = [];
    setStrokes([]);
  }

  const selectedFont = SIGNATURE_FONTS.find((font) => font.id === fontId) ?? SIGNATURE_FONTS[0];

  return (
    <div className="sign-tool">
      <label
        className={`dropzone ${fileName ? "compact" : ""} ${draggingFile ? "dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDraggingFile(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDraggingFile(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDraggingFile(false);
          void openPdf(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => void openPdf(Array.from(event.target.files ?? []))}
        />
        <span className="file-icon" aria-hidden="true">
          <Upload size={24} />
        </span>
        <strong>{fileName ? "다른 PDF로 바꾸기" : "서명할 PDF를 여기에 놓거나 선택"}</strong>
        <span>
          {fileName
            ? `${fileName} · ${formatBytes(fileSize)}`
            : "파일은 이 브라우저 안에서만 열리며 서버로 전송되지 않습니다."}
        </span>
      </label>

      {!fontsReady ? <div className="notice">손글씨 글꼴을 불러오는 중입니다.</div> : null}
      {busy ? (
        <div className="progress" aria-label="처리 중">
          <div />
        </div>
      ) : null}
      {message ? <div className="notice" role="status">{message}</div> : null}

      <div className="segmented" role="group" aria-label="서명 종류">
        {([
          ["signature", "서명"],
          ["stamp", "도장"],
          ["draw", "직접 그리기"]
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={mode === id ? "active" : ""}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "signature" ? (
        <div className="sign-controls">
          <div className="field">
            <label htmlFor="sign-name">이름</label>
            <input
              id="sign-name"
              value={name}
              maxLength={40}
              placeholder="홍길동"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <InkChoices ink={ink} onChange={setInk} />
          <div className="font-choices" role="radiogroup" aria-label="글꼴">
            {SIGNATURE_FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                className={fontId === font.id ? "active" : ""}
                aria-checked={fontId === font.id}
                role="radio"
                onClick={() => setFontId(font.id)}
              >
                <span>{font.label}</span>
                {fontCards[font.id] ? (
                  <img src={fontCards[font.id]} alt={`${font.label} 글꼴 미리보기`} />
                ) : (
                  <strong>{name.trim() || "홍길동"}</strong>
                )}
              </button>
            ))}
          </div>
          <p className="order-hint">선택한 글꼴은 {selectedFont.label}입니다. 색은 검정 또는 파랑이며 배경은 투명합니다.</p>
        </div>
      ) : null}

      {mode === "stamp" ? (
        <div className="sign-controls">
          <div className="field">
            <label htmlFor="seal-name">도장 이름</label>
            <input
              id="seal-name"
              value={name}
              maxLength={12}
              placeholder="홍길동"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="segmented" role="radiogroup" aria-label="도장 모양">
            <button className={shape === "round" ? "active" : ""} type="button" onClick={() => setShape("round")}>원형</button>
            <button className={shape === "square" ? "active" : ""} type="button" onClick={() => setShape("square")}>사각</button>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={texture} onChange={(event) => setTexture(event.target.checked)} />
            잉크 질감
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={suffixIn}
              disabled={sealCount !== 3}
              onChange={(event) => setSuffixIn(event.target.checked)}
            />
            세 글자 이름 뒤에 ‘인’ 붙이기
          </label>
          <p className="order-hint">
            {sealCount >= 2 && sealCount <= 4
              ? "두 글자는 세로로, 세 글자는 성씨를 오른쪽에, 네 글자는 오른쪽 위부터 내려 적습니다."
              : "도장은 띄어쓰기 없이 2자에서 4자까지 만들 수 있습니다."}
          </p>
        </div>
      ) : null}

      {mode === "draw" ? (
        <div className="sign-controls">
          <InkChoices ink={ink} onChange={setInk} />
          <div className="field">
            <label htmlFor="pen-size">굵기 {penSize}</label>
            <input
              id="pen-size"
              type="range"
              min={3}
              max={18}
              value={penSize}
              onChange={(event) => setPenSize(Number(event.target.value))}
            />
          </div>
          <div className="draw-frame">
            <canvas
              ref={drawRef}
              width={DRAW_WIDTH}
              height={DRAW_HEIGHT}
              className="draw-pad"
              aria-label="서명을 그리는 칸"
              onPointerDown={startStroke}
              onPointerMove={moveStroke}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={undoStroke} disabled={strokes.length === 0}>
              <Undo2 size={17} /> 획 되돌리기
            </button>
            <button className="button secondary" type="button" onClick={clearStrokes} disabled={strokes.length === 0}>
              <Trash2 size={17} /> 지우기
            </button>
          </div>
        </div>
      ) : null}

      <div className="mark-row">
        <div className={`mark-preview ${mode === "stamp" ? "seal" : ""}`}>
          {asset ? <img src={asset.dataUrl} alt={mode === "stamp" ? "도장 미리보기" : "서명 미리보기"} /> : <span>미리보기가 여기에 나타납니다.</span>}
        </div>
        <button className="button secondary" type="button" onClick={savePng} disabled={!asset}>
          <Download size={17} /> PNG 저장
        </button>
      </div>

      {page ? (
        <>
          <p className="order-hint">
            페이지를 누르면 현재 서명이나 도장이 놓입니다. 드래그로 옮기고, 모서리로 비율을 유지한 채 크기를 조절한 뒤 삭제할 수 있습니다.
          </p>
          <div className="sign-page-nav">
            <button className="button secondary" type="button" disabled={currentPage === 0} onClick={() => showPage(currentPage - 1)}>
              이전
            </button>
            <strong>{currentPage + 1} / {pages.length}쪽</strong>
            <button
              className="button secondary"
              type="button"
              disabled={currentPage >= pages.length - 1}
              onClick={() => showPage(currentPage + 1)}
            >
              다음
            </button>
          </div>
          <div className="sign-frame">
            <div className="sign-stage">
              <img
                ref={imageRef}
                className="sign-page"
                src={page.previewUrl}
                alt={`${currentPage + 1}쪽`}
                draggable={false}
                onPointerDown={(event) => {
                  if (event.target !== imageRef.current) return;
                  tapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                }}
                onPointerUp={(event) => {
                  const tap = tapRef.current;
                  tapRef.current = null;
                  if (!tap || tap.pointerId !== event.pointerId) return;
                  if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) return;
                  placeAt(event.clientX, event.clientY);
                }}
              />
              {pageMarks.map((mark) => {
                const height = placementHeightFraction(mark.w, mark.aspect, page.visualWidth, page.visualHeight);
                const selected = mark.id === selectedId;
                return (
                  <div
                    key={mark.id}
                    className={`sign-mark ${selected ? "selected" : ""}`}
                    style={{
                      left: `${mark.x * 100}%`,
                      top: `${mark.y * 100}%`,
                      width: `${mark.w * 100}%`,
                      height: `${height * 100}%`
                    }}
                    onPointerDown={(event) => beginMove(event, mark)}
                    onPointerMove={updateDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <img src={mark.dataUrl} alt="" draggable={false} />
                    {selected ? (
                      <>
                        <button
                          className="sign-delete"
                          type="button"
                          aria-label="이 서명 삭제"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPlacements((items) => items.filter((item) => item.id !== mark.id));
                            setSelectedId(null);
                            setResult(null);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                          <button
                            key={corner}
                            className={`sign-handle ${corner}`}
                            type="button"
                            aria-label="크기 조절"
                            onPointerDown={(event) => beginResize(event, mark, corner)}
                            onPointerMove={updateDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sign-thumbs" aria-label="페이지 선택">
            {pages.map((item, index) => {
              const count = placements.filter((mark) => mark.pageIndex === item.pageIndex).length;
              return (
                <button
                  key={item.pageIndex}
                  type="button"
                  className={index === currentPage ? "active" : ""}
                  onClick={() => showPage(index)}
                >
                  <img src={item.previewUrl} alt="" />
                  <span>{index + 1}{count > 0 ? ` · ${count}` : ""}</span>
                </button>
              );
            })}
          </div>

          <div className="toolbar">
            <button className="button secondary" type="button" disabled={!selectedId} onClick={applyToAll}>
              <Redo2 size={17} /> 모든 페이지에 복제
            </button>
            <button className="button secondary" type="button" disabled={!selectedId} onClick={removeSelected}>
              <Trash2 size={17} /> 선택 삭제
            </button>
            <button className="button" type="button" disabled={busy || placements.length === 0} onClick={() => void savePdf()}>
              <Download size={17} /> {busy ? "저장 중" : "서명 PDF 저장"}
            </button>
          </div>
        </>
      ) : (
        <p className="empty-state">PDF를 열면 페이지 위에서 서명과 도장 위치를 정할 수 있습니다.</p>
      )}

      {result ? (
        <>
          <div className="result">
            <div>
              <strong>{result.filename}</strong>
              <div>원본 내용은 유지한 채 서명과 도장만 이미지로 넣었습니다. {formatBytes(result.bytes.byteLength)}</div>
            </div>
            <button className="button" type="button" onClick={() => downloadBytes(result.bytes, result.filename)}>
              <Download size={17} /> 다운로드
            </button>
          </div>
          {previewUrl ? (
            <div className="preview">
              <div className="preview-head">
                <div>
                  <strong>서명한 PDF 미리보기</strong>
                  <span>다운로드 전에 위치와 크기를 확인하세요.</span>
                </div>
              </div>
              <iframe src={previewUrl} title="서명한 PDF 미리보기" />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function InkChoices({ ink, onChange }: { ink: InkName; onChange: (ink: InkName) => void }) {
  return (
    <div className="color-choices" role="radiogroup" aria-label="글자색">
      <button className={ink === "black" ? "active" : ""} type="button" role="radio" aria-checked={ink === "black"} onClick={() => onChange("black")}>
        <i style={{ background: INK_COLORS.black }} /> 검정
      </button>
      <button className={ink === "blue" ? "active" : ""} type="button" role="radio" aria-checked={ink === "blue"} onClick={() => onChange("blue")}>
        <i style={{ background: INK_COLORS.blue }} /> 파랑
      </button>
    </div>
  );
}

type DragSession = {
  pointerId: number;
  id: string;
  mode: "move" | "resize";
  corner?: ResizeCorner;
  origin: { x: number; y: number; w: number; h: number };
  pointerX: number;
  pointerY: number;
  aspect: number;
  pageWidth: number;
  pageHeight: number;
};
