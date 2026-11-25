"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eraser, PenLine, Redo2, Trash2, Undo2, Upload } from "lucide-react";
import { embedSignatureImages } from "@/lib/embed-marks";
import { loadSignPages, type SignPage } from "@/lib/load-sign-pages";
import { makeId } from "@/lib/pdf-tools";
import {
  signatureColors,
  signatureStyles,
  stampColors,
  stampFontChoices,
  stampPresets
} from "@/lib/mark-styles";
import { rasterFromCanvas, renderSignature, renderStamp, type Raster } from "@/lib/render-marks";
import {
  clientPointToNormalized,
  heightFractionForWidth,
  normalizeDegrees
} from "@/lib/signature-geometry";
import { markPngFilename, signedPdfFilename } from "@/lib/sign-names";
import {
  loadedFontFaces,
  signatureFallback,
  signatureFontFaces,
  stampFallback,
  stampFontFaces
} from "./signature-fonts";

type Mode = "signature" | "stamp";
type SignatureSource = "style" | "draw";
type Variant = Raster & { id: string; label: string; kind: "signature" | "stamp" };
type Selection = { kind: "signature"; id: string } | { kind: "stamp"; id: string } | { kind: "draw" };
type Asset = Raster & { id: string; label: string; kind: "signature" | "stamp" | "draw" };
type PlacedMark = {
  id: string;
  groupId: string;
  pageIndex: number;
  assetId: string;
  nx: number;
  ny: number;
  nw: number;
  rotation: number;
};
type Point = { x: number; y: number };
type Stroke = { points: Point[]; cssWidth: number };
type Drag =
  | {
      kind: "move";
      pointerId: number;
      id: string;
      originNx: number;
      originNy: number;
      startX: number;
      startY: number;
      width: number;
      height: number;
    }
  | {
      kind: "resize";
      pointerId: number;
      id: string;
      centerX: number;
      centerY: number;
      startDist: number;
      startNw: number;
    }
  | {
      kind: "rotate";
      pointerId: number;
      id: string;
      centerX: number;
      centerY: number;
      offset: number;
    };
type Result = { filename: string; bytes: Uint8Array; detail: string };

const sampleName = "홍길동";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function saveBytes(bytes: Uint8Array, filename: string, mime: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function defaultWidth(kind: Asset["kind"], aspect: number) {
  if (kind === "stamp") return aspect > 1.25 ? 0.32 : 0.2;
  return 0.36;
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: Stroke[], color: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    context.beginPath();
    context.lineWidth = Math.max(1, stroke.cssWidth * scale);
    context.moveTo(first.x, first.y);
    if (stroke.points.length === 1) {
      context.lineTo(first.x + 0.01, first.y);
    } else {
      for (let index = 1; index < stroke.points.length - 1; index += 1) {
        const current = stroke.points[index];
        const next = stroke.points[index + 1];
        if (!current || !next) continue;
        context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
      }
      const last = stroke.points[stroke.points.length - 1];
      if (last) context.lineTo(last.x, last.y);
    }
    context.stroke();
  }
}

export default function SignatureTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<SignPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("signature");
  const [signatureSource, setSignatureSource] = useState<SignatureSource>("style");
  const [signatureColor, setSignatureColor] = useState<(typeof signatureColors)[number]["id"]>("black");
  const [stampColor, setStampColor] = useState<(typeof stampColors)[number]["id"]>("cinnabar");
  const [stampFont, setStampFont] = useState<(typeof stampFontChoices)[number]["id"]>("myeongjoBold");
  const [appendIn, setAppendIn] = useState(true);
  const [texture, setTexture] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [signatureVariants, setSignatureVariants] = useState<Variant[]>([]);
  const [stampVariants, setStampVariants] = useState<Variant[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drawAsset, setDrawAsset] = useState<(Raster & { label: string }) | null>(null);
  const [penWidth, setPenWidth] = useState(6);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [marks, setMarks] = useState<PlacedMark[]>([]);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const drawingRef = useRef(false);
  const applyAllRef = useRef(applyAll);
  const marksRef = useRef(marks);
  const pagesRef = useRef(pages);
  const assetsRef = useRef(assets);
  applyAllRef.current = applyAll;
  marksRef.current = marks;
  pagesRef.current = pages;
  assetsRef.current = assets;

  const color = signatureColors.find((item) => item.id === signatureColor)?.value ?? "#191f28";
  const graphemes = Array.from(name.normalize("NFC").replace(/\s+/g, ""));
  const page = pages[pageIndex] ?? null;
  const pageMarks = marks.filter((mark) => mark.pageIndex === pageIndex);
  const selectedMark = marks.find((mark) => mark.id === selectedMarkId) ?? null;

  useEffect(() => {
    let cancelled = false;
    const sample = "가나다라홍길동인ABCDEFG";
    void (async () => {
      try {
        await Promise.all(
          loadedFontFaces.map((face) => document.fonts.load(`64px ${face.style.fontFamily}`, sample))
        );
        await document.fonts.ready;
      } catch {
        // Drawing still falls back to the next loaded family.
      }
      if (!cancelled) setFontsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fontsReady) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        const text = name.trim() || sampleName;
        const ink = signatureColors.find((item) => item.id === signatureColor)?.value ?? "#191f28";
        const next = signatureStyles.map((style) => {
          const face = signatureFontFaces[style.fontId];
          const raster = renderSignature({
            text,
            fontFamily: face.style.fontFamily,
            fallbackFamily: signatureFallback.style.fontFamily,
            color: ink,
            slant: style.slant,
            flourish: style.flourish
          });
          return { ...raster, id: style.id, label: style.label, kind: "signature" as const };
        });
        if (!cancelled) setSignatureVariants(next);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "서명을 만들지 못했습니다.");
      }
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fontsReady, name, signatureColor]);

  useEffect(() => {
    if (!fontsReady) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        const text = name.trim() || sampleName;
        const ink = stampColors.find((item) => item.id === stampColor)?.value ?? "#d0212b";
        const face = stampFontFaces[stampFont];
        const next = stampPresets.map((preset) => {
          const raster = renderStamp({
            text,
            fontFamily: face.style.fontFamily,
            fallbackFamily: stampFallback.style.fontFamily,
            color: ink,
            shape: preset.shape,
            layout: preset.layout,
            relief: preset.relief,
            doubleBorder: preset.doubleBorder,
            texture,
            appendIn: appendIn && graphemes.length === 3,
            aspect: preset.aspect
          });
          return { ...raster, id: preset.id, label: preset.label, kind: "stamp" as const };
        });
        if (!cancelled) setStampVariants(next);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "도장을 만들지 못했습니다.");
      }
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [appendIn, fontsReady, graphemes.length, name, stampColor, stampFont, texture]);

  useEffect(() => {
    if (selection === null && signatureVariants[0]) {
      setSelection({ kind: "signature", id: signatureVariants[0].id });
    }
  }, [selection, signatureVariants]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "signature" || signatureSource !== "draw") return;
    canvas.width = 1400;
    canvas.height = 480;
    drawStrokes(canvas, strokes, color);
  }, [color, mode, signatureSource, strokes]);

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

  function currentRaster() {
    if (selection?.kind === "draw") {
      return drawAsset ? { ...drawAsset, kind: "draw" as const } : null;
    }
    if (selection?.kind === "signature") {
      return signatureVariants.find((item) => item.id === selection.id) ?? null;
    }
    if (selection?.kind === "stamp") {
      return stampVariants.find((item) => item.id === selection.id) ?? null;
    }
    return null;
  }

  async function openFile(next: File) {
    if (!(next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf"))) {
      setMessage("PDF 파일만 열 수 있습니다.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setResult(null);
    setMarks([]);
    setAssets([]);
    setSelectedMarkId(null);
    setFile(next);
    try {
      const loaded = await loadSignPages(next);
      setPages(loaded);
      setPageIndex(0);
      setMessage(`${loaded.length}쪽을 불러왔습니다. 스타일을 고른 뒤 페이지를 누르세요.`);
    } catch (error) {
      setPages([]);
      setFile(null);
      setMessage(error instanceof Error ? error.message : "PDF를 열 수 없습니다. 암호화되었거나 손상된 파일일 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  function patchMark(id: string, patch: Partial<Pick<PlacedMark, "nx" | "ny" | "nw" | "rotation">>) {
    setMarks((current) => {
      const target = current.find((mark) => mark.id === id);
      if (!target) return current;
      return current.map((mark) => {
        if (mark.id === id || (applyAllRef.current && mark.groupId === target.groupId)) {
          return { ...mark, ...patch };
        }
        return mark;
      });
    });
  }

  function deleteMark(id: string) {
    setMarks((current) => {
      const target = current.find((mark) => mark.id === id);
      if (!target) return current;
      if (applyAllRef.current) return current.filter((mark) => mark.groupId !== target.groupId);
      return current.filter((mark) => mark.id !== id);
    });
    setSelectedMarkId((current) => (current === id ? null : current));
    setResult(null);
  }

  function placeAt(x: number, y: number) {
    const raster = currentRaster();
    if (!raster || pages.length === 0) {
      setMessage("서명이나 도장을 먼저 고르세요.");
      return;
    }
    const asset: Asset = {
      id: makeId(),
      label: raster.label,
      kind: raster.kind,
      dataUrl: raster.dataUrl,
      pngBytes: raster.pngBytes.slice(),
      width: raster.width,
      height: raster.height
    };
    const nw = defaultWidth(asset.kind, asset.width / Math.max(1, asset.height));
    const groupId = makeId();
    const targets = applyAll ? pages : pages.filter((item) => item.index === pageIndex);
    const created = targets.map((item) => {
      const nh = heightFractionForWidth(nw, item.displayWidth, item.displayHeight, asset.width / asset.height);
      return {
        id: makeId(),
        groupId,
        pageIndex: item.index,
        assetId: asset.id,
        nw,
        nx: clamp(x - nw / 2, 0, Math.max(0, 1 - nw)),
        ny: clamp(y - nh / 2, 0, Math.max(0, 1 - nh)),
        rotation: 0
      };
    });
    setAssets((current) => [...current, asset]);
    setMarks((current) => [...current, ...created]);
    setSelectedMarkId(created.find((mark) => mark.pageIndex === pageIndex)?.id ?? null);
    setMessage(null);
    setResult(null);
  }

  function enableApplyAll(checked: boolean) {
    setApplyAll(checked);
    if (!checked) return;
    setMarks((current) => {
      const onPage = current.filter((mark) => mark.pageIndex === pageIndex);
      let next = [...current];
      for (const mark of onPage) {
        for (const item of pages) {
          if (item.index === pageIndex) continue;
          const existing = next.find((candidate) => candidate.groupId === mark.groupId && candidate.pageIndex === item.index);
          if (existing) {
            next = next.map((candidate) =>
              candidate.id === existing.id
                ? { ...candidate, nx: mark.nx, ny: mark.ny, nw: mark.nw, rotation: mark.rotation }
                : candidate
            );
          } else {
            next.push({ ...mark, id: makeId(), pageIndex: item.index });
          }
        }
      }
      return next;
    });
  }

  function showPage(index: number) {
    setPageIndex(index);
    setSelectedMarkId((current) => {
      const selected = marks.find((mark) => mark.id === current);
      if (!selected) return null;
      if (selected.pageIndex === index) return current;
      return marks.find((mark) => mark.groupId === selected.groupId && mark.pageIndex === index)?.id ?? null;
    });
  }

  function useDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raster = rasterFromCanvas(canvas, 24);
    if (!raster) {
      setMessage("캔버스에 서명을 먼저 그려 주세요.");
      return;
    }
    setDrawAsset({ ...raster, label: "직접 그린 서명" });
    setSelection({ kind: "draw" });
    setMessage("직접 그린 서명을 골랐습니다. 페이지를 누르면 올라갑니다.");
  }

  function downloadSelectedPng() {
    const selectedAsset = selectedMark ? assets.find((asset) => asset.id === selectedMark.assetId) : null;
    const raster = selectedAsset ?? currentRaster();
    if (!raster) {
      setMessage("저장할 서명이나 도장을 먼저 고르세요.");
      return;
    }
    saveBytes(raster.pngBytes, markPngFilename(raster.label), "image/png");
  }

  async function savePdf() {
    if (!file || marks.length === 0) {
      setMessage("페이지에 서명이나 도장을 먼저 올려 주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const output = await embedSignatureImages(
        new Uint8Array(await file.arrayBuffer()),
        pages.map((item) => item.metrics),
        marks.map((mark) => {
          const asset = assets.find((item) => item.id === mark.assetId);
          if (!asset) throw new Error("서명 이미지를 찾지 못했습니다. 다시 올려 주세요.");
          return {
            pageIndex: mark.pageIndex,
            imageKey: asset.id,
            pngBytes: asset.pngBytes,
            nx: mark.nx,
            ny: mark.ny,
            nw: mark.nw,
            rotation: mark.rotation,
            pixelWidth: asset.width,
            pixelHeight: asset.height
          };
        })
      );
      setResult({
        filename: signedPdfFilename(file.name),
        bytes: output,
        detail: `${marks.length}개를 원본 페이지 위에 넣었습니다.`
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const usingSample = name.trim().length === 0;
  const activeVariants = mode === "signature" ? signatureVariants : stampVariants;

  return (
    <div className="panel-body sign-tool">
      <div className="font-preload" aria-hidden="true">
        {loadedFontFaces.map((face) => (
          <span className={face.className} key={face.className}>
            가나다홍길동인
          </span>
        ))}
      </div>

      <label
        className="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const next = event.dataTransfer.files[0];
          if (next) void openFile(next);
        }}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = "";
            if (next) void openFile(next);
          }}
        />
        <span className="file-icon" aria-hidden="true">
          <Upload size={24} />
        </span>
        <strong>{file ? "다른 PDF로 바꾸기" : "PDF를 여기에 놓거나 선택"}</strong>
        <span>문서 위에 서명이나 도장을 올립니다. 파일은 이 브라우저 안에만 있습니다.</span>
      </label>

      {file ? (
        <p className="order-hint">
          {file.name}
          {pages.length > 0 ? ` · ${pages.length}쪽` : ""}
        </p>
      ) : null}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="sign-name">이름</label>
          <input
            id="sign-name"
            value={name}
            placeholder="홍길동"
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="segmented" role="tablist" aria-label="서명 또는 도장">
          <button type="button" className={mode === "signature" ? "active" : ""} onClick={() => setMode("signature")}>
            서명
          </button>
          <button type="button" className={mode === "stamp" ? "active" : ""} onClick={() => setMode("stamp")}>
            도장
          </button>
        </div>
      </div>

      {mode === "signature" ? (
        <>
          <div className="chip-row" role="radiogroup" aria-label="서명 색">
            {signatureColors.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip ${signatureColor === item.id ? "active" : ""}`}
                aria-checked={signatureColor === item.id}
                role="radio"
                onClick={() => setSignatureColor(item.id)}
              >
                <span className="chip-swatch" style={{ background: item.value }} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="tablist" aria-label="서명 만드는 방법">
            <button
              type="button"
              className={signatureSource === "style" ? "active" : ""}
              onClick={() => setSignatureSource("style")}
            >
              <PenLine size={16} /> 글씨로 만들기
            </button>
            <button
              type="button"
              className={signatureSource === "draw" ? "active" : ""}
              onClick={() => setSignatureSource("draw")}
            >
              직접 그리기
            </button>
          </div>
          {signatureSource === "draw" ? (
            <div className="draw-block">
              <div className="field">
                <label htmlFor="pen-width">펜 굵기 {penWidth}</label>
                <input
                  id="pen-width"
                  type="range"
                  min={2}
                  max={18}
                  value={penWidth}
                  onChange={(event) => setPenWidth(Number(event.target.value))}
                />
              </div>
              <div className="draw-frame checker">
                <canvas
                  ref={canvasRef}
                  className="draw-pad"
                  aria-label="서명 그리기 영역"
                  onPointerDown={(event) => {
                    const canvas = event.currentTarget;
                    const rect = canvas.getBoundingClientRect();
                    canvas.setPointerCapture(event.pointerId);
                    drawingRef.current = true;
                    const point = {
                      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
                      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
                    };
                    setStrokes((current) => [...current, { points: [point], cssWidth: penWidth }]);
                  }}
                  onPointerMove={(event) => {
                    if (!drawingRef.current) return;
                    const canvas = event.currentTarget;
                    const rect = canvas.getBoundingClientRect();
                    const point = {
                      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
                      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
                    };
                    setStrokes((current) => {
                      const next = [...current];
                      const last = next[next.length - 1];
                      if (!last) return current;
                      next[next.length - 1] = { ...last, points: [...last.points, point] };
                      return next;
                    });
                  }}
                  onPointerUp={() => {
                    drawingRef.current = false;
                  }}
                  onPointerCancel={() => {
                    drawingRef.current = false;
                  }}
                />
              </div>
              <div className="toolbar">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setStrokes((current) => current.slice(0, -1))}
                  disabled={strokes.length === 0}
                >
                  <Undo2 size={16} /> 되돌리기
                </button>
                <button className="button secondary" type="button" onClick={() => setStrokes([])} disabled={strokes.length === 0}>
                  <Eraser size={16} /> 지우기
                </button>
                <button className="button" type="button" onClick={useDrawing} disabled={strokes.length === 0}>
                  <Redo2 size={16} /> 이 그리기 사용
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={appendIn && graphemes.length === 3}
              disabled={graphemes.length !== 3}
              onChange={(event) => setAppendIn(event.target.checked)}
            />
            세 글자 이름 뒤에 ‘인’ 붙이기
          </label>
          <p className="field-hint">세 글자일 때 네 칸으로 맞춥니다. 글자는 오른쪽 줄부터 위에서 아래로 읽습니다.</p>
          <label className="check-row">
            <input type="checkbox" checked={texture} onChange={(event) => setTexture(event.target.checked)} />
            잉크 질감
          </label>
          <div className="chip-row" role="radiogroup" aria-label="도장 글꼴">
            {stampFontChoices.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={stampFont === item.id}
                className={`chip ${stampFont === item.id ? "active" : ""}`}
                onClick={() => setStampFont(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="chip-row" role="radiogroup" aria-label="도장 색">
            {stampColors.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={stampColor === item.id}
                className={`chip ${stampColor === item.id ? "active" : ""}`}
                onClick={() => setStampColor(item.id)}
              >
                <span className="chip-swatch" style={{ background: item.value }} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "stamp" || signatureSource === "style" ? (
        <>
          <p className="order-hint">
            {usingSample ? "이름을 입력하기 전에는 예시 ‘홍길동’으로 보여 줍니다." : "스타일을 고른 뒤 아래 페이지를 누르세요."}
            {fontsReady ? "" : " 글꼴을 불러오는 중입니다."}
          </p>
          <div className="variant-grid">
            {activeVariants.map((variant) => {
              const selected = selection?.kind === variant.kind && selection.id === variant.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  className={`variant-card ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => setSelection({ kind: variant.kind, id: variant.id })}
                >
                  <span className="variant-preview checker">
                    <img src={variant.dataUrl} alt="" />
                  </span>
                  <span>{variant.label}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <p className="font-credit">
        손글씨 나눔 펜·붓, 개구, 하이멜로디, 연성, 감자꽃, 동해독도, 싱글데이와 도장용 나눔명조, 송명조, 고운바탕, 도현,
        블랙한산스를 한글 서브셋으로 실어 둡니다. 모두 SIL Open Font License입니다.
      </p>

      {busy ? (
        <div className="progress" aria-label="처리 중">
          <div />
        </div>
      ) : null}
      {message ? <div className="notice">{message}</div> : null}

      {page ? (
        <>
          <div className="sign-stage-head">
            <strong>
              {page.label}쪽 / {pages.length}쪽
            </strong>
            <span>페이지를 눌러 올리고, 끌어 옮긴 뒤 모서리로 크기를 조절합니다.</span>
          </div>
          <div className="sign-thumbs" aria-label="페이지 선택">
            {pages.map((item) => (
              <button
                key={item.index}
                type="button"
                className={`sign-thumb ${item.index === pageIndex ? "active" : ""}`}
                onClick={() => showPage(item.index)}
              >
                <img src={item.previewUrl} alt="" />
                <span>{item.label}쪽</span>
              </button>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={applyAll}
              disabled={pages.length < 2}
              onChange={(event) => enableApplyAll(event.target.checked)}
            />
            모든 페이지에 같은 위치 적용
          </label>
          <div
            className="sign-stage"
            ref={pageRef}
            tabIndex={0}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest(".sign-mark")) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const point = clientPointToNormalized(event.clientX, event.clientY, rect);
              placeAt(point.x, point.y);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSelectedMarkId(null);
              if ((event.key === "Delete" || event.key === "Backspace") && selectedMarkId) {
                event.preventDefault();
                deleteMark(selectedMarkId);
              }
            }}
          >
            <img className="sign-page-image" src={page.previewUrl} alt={`${page.label}쪽 미리보기`} draggable={false} />
            {pageMarks.map((mark) => {
              const asset = assets.find((item) => item.id === mark.assetId);
              if (!asset) return null;
              const nh = heightFractionForWidth(
                mark.nw,
                page.displayWidth,
                page.displayHeight,
                asset.width / Math.max(1, asset.height)
              );
              const selected = mark.id === selectedMarkId;
              return (
                <div
                  key={mark.id}
                  className={`sign-mark ${selected ? "selected" : ""}`}
                  style={{
                    left: `${mark.nx * 100}%`,
                    top: `${mark.ny * 100}%`,
                    width: `${mark.nw * 100}%`,
                    height: `${nh * 100}%`,
                    transform: `rotate(${mark.rotation}deg)`
                  }}
                  onPointerDown={(event) => {
                    if ((event.target as HTMLElement).closest("[data-handle]")) return;
                    event.stopPropagation();
                    event.preventDefault();
                    const rect = pageRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setSelectedMarkId(mark.id);
                    dragRef.current = {
                      kind: "move",
                      pointerId: event.pointerId,
                      id: mark.id,
                      originNx: mark.nx,
                      originNy: mark.ny,
                      startX: event.clientX,
                      startY: event.clientY,
                      width: rect.width,
                      height: rect.height
                    };
                  }}
                  onPointerMove={(event) => {
                    const drag = dragRef.current;
                    if (!drag || drag.kind !== "move" || drag.pointerId !== event.pointerId) return;
                    patchMark(drag.id, {
                      nx: drag.originNx + (event.clientX - drag.startX) / Math.max(1, drag.width),
                      ny: drag.originNy + (event.clientY - drag.startY) / Math.max(1, drag.height)
                    });
                  }}
                  onPointerUp={(event) => {
                    if (dragRef.current?.pointerId === event.pointerId && dragRef.current.kind === "move") {
                      dragRef.current = null;
                    }
                  }}
                >
                  <img src={asset.dataUrl} alt={asset.label} draggable={false} />
                  {selected ? (
                    <>
                      <span className="sign-rotate-stem" />
                      <button
                        type="button"
                        className="sign-rotate"
                        data-handle="rotate"
                        aria-label="회전"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          const rect = pageRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const centerX = rect.left + (mark.nx + mark.nw / 2) * rect.width;
                          const centerY = rect.top + (mark.ny + nh / 2) * rect.height;
                          const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          dragRef.current = {
                            kind: "rotate",
                            pointerId: event.pointerId,
                            id: mark.id,
                            centerX,
                            centerY,
                            offset: angle - mark.rotation
                          };
                        }}
                        onPointerMove={(event) => {
                          const drag = dragRef.current;
                          if (!drag || drag.kind !== "rotate" || drag.pointerId !== event.pointerId) return;
                          const angle = (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI;
                          patchMark(drag.id, { rotation: normalizeDegrees(angle - drag.offset) });
                        }}
                        onPointerUp={(event) => {
                          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
                        }}
                      />
                      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <button
                          key={corner}
                          type="button"
                          className={`sign-handle ${corner}`}
                          data-handle="resize"
                          aria-label="크기 조절"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            const rect = pageRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const centerX = rect.left + (mark.nx + mark.nw / 2) * rect.width;
                            const centerY = rect.top + (mark.ny + nh / 2) * rect.height;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            dragRef.current = {
                              kind: "resize",
                              pointerId: event.pointerId,
                              id: mark.id,
                              centerX,
                              centerY,
                              startDist: Math.max(12, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
                              startNw: mark.nw
                            };
                          }}
                          onPointerMove={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.kind !== "resize" || drag.pointerId !== event.pointerId) return;
                            const rect = pageRef.current?.getBoundingClientRect();
                            const current = marksRef.current.find((item) => item.id === drag.id);
                            const currentPage = pagesRef.current[pageIndex];
                            const currentAsset = current
                              ? assetsRef.current.find((item) => item.id === current.assetId)
                              : undefined;
                            if (!rect || !current || !currentPage || !currentAsset) return;
                            const dist = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
                            const nw = clamp((drag.startNw * dist) / drag.startDist, 0.06, 1.15);
                            const aspect = currentAsset.width / Math.max(1, currentAsset.height);
                            const nextHeight = heightFractionForWidth(
                              nw,
                              currentPage.displayWidth,
                              currentPage.displayHeight,
                              aspect
                            );
                            const centerNx = (drag.centerX - rect.left) / Math.max(1, rect.width);
                            const centerNy = (drag.centerY - rect.top) / Math.max(1, rect.height);
                            patchMark(drag.id, {
                              nw,
                              nx: centerNx - nw / 2,
                              ny: centerNy - nextHeight / 2
                            });
                          }}
                          onPointerUp={(event) => {
                            if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        className="sign-delete"
                        data-handle="delete"
                        aria-label="이 서명 삭제"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteMark(mark.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          {selectedMark ? (
            <div className="toolbar">
              <div className="field">
                <label htmlFor="mark-rotation">회전 {Math.round(selectedMark.rotation)}°</label>
                <input
                  id="mark-rotation"
                  type="range"
                  min={-180}
                  max={180}
                  value={selectedMark.rotation}
                  onChange={(event) => patchMark(selectedMark.id, { rotation: Number(event.target.value) })}
                />
              </div>
              <button className="button secondary" type="button" onClick={() => deleteMark(selectedMark.id)}>
                <Trash2 size={16} /> 선택 삭제
              </button>
            </div>
          ) : null}

          <div className="toolbar">
            <button className="button" type="button" disabled={busy || marks.length === 0} onClick={() => void savePdf()}>
              <Download size={17} /> {busy ? "저장 중" : "서명한 PDF 저장"}
            </button>
            <button className="button secondary" type="button" onClick={downloadSelectedPng}>
              <Download size={17} /> 선택한 이미지 PNG
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={marks.length === 0}
              onClick={() => {
                setMarks([]);
                setSelectedMarkId(null);
                setResult(null);
              }}
            >
              <Trash2 size={16} /> 올린 것 모두 지우기
            </button>
          </div>
          <p className="field-hint">저장 파일 이름은 원본 이름 뒤에 _서명이 붙습니다. 원본 페이지 내용은 다시 그리지 않습니다.</p>
          <p className="field-hint">문서에 올리는 도장 이미지이며, 주민센터에 등록한 인감을 대신하지 않습니다.</p>
        </>
      ) : null}

      {result ? (
        <>
          <div className="result">
            <div>
              <strong>{result.filename}</strong>
              <div>{result.detail}</div>
            </div>
            <button className="button" type="button" onClick={() => saveBytes(result.bytes, result.filename, "application/pdf")}>
              <Download size={17} /> 다운로드
            </button>
          </div>
          {previewUrl ? (
            <div className="preview">
              <div className="preview-head">
                <div>
                  <strong>PDF 미리보기</strong>
                  <span>서명이 들어간 결과를 확인하세요.</span>
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
