"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Combine,
  Download,
  FileImage,
  FileLock2,
  FileText,
  Lock,
  Scissors,
  ShieldCheck,
  Trash2,
  Upload
} from "lucide-react";
import {
  downloadBytes,
  formatBytes,
  imagesToPdf,
  makeId,
  mergePdfs,
  splitPdf,
  type ImageFit,
  type ToolFile
} from "@/lib/pdf-tools";

type Tab = "image" | "split" | "merge";
type Result = {
  filename: string;
  bytes: Uint8Array;
  detail: string;
};

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "image", label: "이미지 PDF", icon: <FileImage size={21} /> },
  { id: "split", label: "PDF 나누기", icon: <Scissors size={21} /> },
  { id: "merge", label: "PDF 병합", icon: <Combine size={21} /> }
];

function acceptFor(tab: Tab) {
  return tab === "image" ? "image/*" : "application/pdf,.pdf";
}

function defaultOutputName(source: string, suffix: string) {
  return `${source.replace(/\.[^/.]+$/, "")}-${suffix}.pdf`;
}

function Dropzone({
  tab,
  multiple,
  onFiles
}: {
  tab: Tab;
  multiple: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const label = tab === "image" ? "이미지를 여기에 놓거나 선택" : "PDF를 여기에 놓거나 선택";
  const hint = tab === "image"
    ? "JPG, PNG, WebP 파일을 PDF 페이지로 변환합니다."
    : multiple
      ? "여러 PDF를 원하는 순서로 병합합니다."
      : "한 개의 PDF에서 필요한 페이지만 추출합니다.";

  return (
    <label
      className={`dropzone ${dragging ? "dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        type="file"
        accept={acceptFor(tab)}
        multiple={multiple}
        onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
      />
      <span className="file-icon" aria-hidden="true">
        <Upload size={24} />
      </span>
      <strong>{label}</strong>
      <span>{hint}</span>
    </label>
  );
}

function FileList({
  files,
  reorder,
  onRemove,
  onMove
}: {
  files: ToolFile[];
  reorder?: boolean;
  onRemove: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
}) {
  if (files.length === 0) {
    return <p className="empty-state">아직 선택된 파일이 없습니다.</p>;
  }

  return (
    <div className="file-list">
      {files.map((item, index) => (
        <div className="file-row" key={item.id}>
          <div className="file-meta">
            <span className="file-icon" aria-hidden="true">
              <FileText size={19} />
            </span>
            <div className="file-name">
              <strong>{item.file.name}</strong>
              <span>{formatBytes(item.file.size)}</span>
            </div>
          </div>
          <div className="row-actions">
            {reorder ? (
              <>
                <button
                  className="icon-button"
                  type="button"
                  title="위로 이동"
                  disabled={index === 0}
                  onClick={() => onMove?.(item.id, -1)}
                >
                  <ArrowUp size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="아래로 이동"
                  disabled={index === files.length - 1}
                  onClick={() => onMove?.(item.id, 1)}
                >
                  <ArrowDown size={18} />
                </button>
              </>
            ) : null}
            <button className="icon-button" type="button" title="삭제" onClick={() => onRemove(item.id)}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("image");
  const [imageFiles, setImageFiles] = useState<ToolFile[]>([]);
  const [splitFiles, setSplitFiles] = useState<ToolFile[]>([]);
  const [mergeFiles, setMergeFiles] = useState<ToolFile[]>([]);
  const [fit, setFit] = useState<ImageFit>("contain");
  const [pageSelection, setPageSelection] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const activeFiles = useMemo(() => {
    if (tab === "image") return imageFiles;
    if (tab === "split") return splitFiles;
    return mergeFiles;
  }, [imageFiles, mergeFiles, splitFiles, tab]);

  function addFiles(files: File[]) {
    setResult(null);
    setMessage(null);

    const filtered = files.filter((file) => {
      if (tab === "image") return file.type.startsWith("image/");
      return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    });

    if (filtered.length !== files.length) {
      setMessage("지원하는 파일만 추가했습니다.");
    }

    const next = filtered.map((file) => ({ id: makeId(), file }));

    if (tab === "image") {
      setImageFiles((current) => [...current, ...next]);
    } else if (tab === "split") {
      setSplitFiles(next.slice(0, 1));
    } else {
      setMergeFiles((current) => [...current, ...next]);
    }
  }

  function removeFile(id: string) {
    setResult(null);
    if (tab === "image") setImageFiles((current) => current.filter((item) => item.id !== id));
    if (tab === "split") setSplitFiles((current) => current.filter((item) => item.id !== id));
    if (tab === "merge") setMergeFiles((current) => current.filter((item) => item.id !== id));
  }

  function moveMergeFile(id: string, direction: -1 | 1) {
    setMergeFiles((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function runTool() {
    setBusy(true);
    setResult(null);
    setMessage(null);

    try {
      if (tab === "image") {
        const bytes = await imagesToPdf(imageFiles.map((item) => item.file), fit);
        setResult({
          filename: "images-private.pdf",
          bytes,
          detail: `${imageFiles.length}개 이미지 변환 완료`
        });
      }

      if (tab === "split") {
        if (!splitFiles[0]) throw new Error("나눌 PDF를 먼저 추가해주세요.");
        const { bytes, pageCount, selectedCount } = await splitPdf(splitFiles[0].file, pageSelection);
        setResult({
          filename: defaultOutputName(splitFiles[0].file.name, "split"),
          bytes,
          detail: `${pageCount}쪽 중 ${selectedCount}쪽 추출 완료`
        });
      }

      if (tab === "merge") {
        const bytes = await mergePdfs(mergeFiles.map((item) => item.file));
        setResult({
          filename: "merged-private.pdf",
          bytes,
          detail: `${mergeFiles.length}개 PDF 병합 완료`
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리 중 문제가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const canRun = activeFiles.length > 0 && !busy;

  return (
    <main className="app">
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <FileLock2 size={22} />
            </div>
            <div className="brand-copy">
              <strong>Private PDF Studio</strong>
              <span>GitHub Pages 배포용 브라우저 PDF 도구</span>
            </div>
          </div>
          <div className="status-pill">
            <BadgeCheck size={16} />
            GitHub Pages 배포 준비
          </div>
        </div>
      </header>

      <section className="shell hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">No server upload</div>
            <h1>개인정보가 남지 않는 PDF 작업대</h1>
            <p>
              이미지를 PDF로 만들고, PDF를 나누거나 병합합니다. 선택한 파일은 브라우저 안에서만
              읽고 처리하며 GitHub 서버로 전송하지 않습니다.
            </p>
            <div className="privacy-strip">
              <span className="privacy-item">
                <Lock size={16} /> 로컬 메모리 처리
              </span>
              <span className="privacy-item">
                <ShieldCheck size={16} /> 업로드 저장 없음
              </span>
              <span className="privacy-item">
                <Download size={16} /> 결과만 직접 다운로드
              </span>
            </div>
          </div>
          <aside className="privacy-panel" aria-label="개인정보 처리 방식">
            <h2>처리 원칙</h2>
            <ul>
              <li>파일 바이트는 API Route, Server Action, Storage로 보내지 않습니다.</li>
              <li>GitHub Pages는 정적 파일 호스팅만 담당합니다.</li>
              <li>PDF 변환은 사용자의 브라우저에서 실행됩니다.</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="shell workspace">
        <nav className="tabs" aria-label="PDF 도구">
          {tabs.map((item) => (
            <button
              className={`tab-button ${tab === item.id ? "active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setResult(null);
                setMessage(null);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>{tabs.find((item) => item.id === tab)?.label}</h2>
              <p>
                {tab === "image"
                  ? "선택한 이미지 순서대로 A4 PDF 페이지를 생성합니다."
                  : tab === "split"
                    ? "페이지 번호를 입력하면 해당 페이지만 새 PDF로 저장합니다."
                    : "PDF를 목록 순서대로 한 파일로 합칩니다."}
              </p>
            </div>
            <button className="button secondary" type="button" onClick={() => window.location.reload()}>
              <Trash2 size={17} /> 전체 비우기
            </button>
          </div>

          <div className="panel-body">
            <Dropzone tab={tab} multiple={tab !== "split"} onFiles={addFiles} />

            <div className="toolbar">
              {tab === "image" ? (
                <div className="field">
                  <label htmlFor="fit">이미지 맞춤</label>
                  <select id="fit" value={fit} onChange={(event) => setFit(event.target.value as ImageFit)}>
                    <option value="contain">전체 보이기</option>
                    <option value="cover">페이지 채우기</option>
                  </select>
                </div>
              ) : null}

              {tab === "split" ? (
                <div className="field">
                  <label htmlFor="pages">페이지 선택</label>
                  <input
                    id="pages"
                    placeholder="예: 1-3, 5, 8"
                    value={pageSelection}
                    onChange={(event) => setPageSelection(event.target.value)}
                  />
                </div>
              ) : null}

              <button className="button" type="button" disabled={!canRun} onClick={runTool}>
                <Download size={17} />
                {busy ? "처리 중" : "PDF 만들기"}
              </button>
            </div>

            {busy ? (
              <div className="progress" aria-label="처리 중">
                <div />
              </div>
            ) : null}

            {message ? <div className="notice">{message}</div> : null}

            <FileList
              files={activeFiles}
              reorder={tab === "merge"}
              onRemove={removeFile}
              onMove={moveMergeFile}
            />

            {result ? (
              <>
                <div className="result">
                  <div>
                    <strong>{result.filename}</strong>
                    <div>{result.detail}</div>
                  </div>
                  <button className="button" type="button" onClick={() => downloadBytes(result.bytes, result.filename)}>
                    <Download size={17} /> 다운로드
                  </button>
                </div>

                {previewUrl ? (
                  <div className="preview">
                    <div className="preview-head">
                      <div>
                        <strong>PDF 미리보기</strong>
                        <span>다운로드 전에 페이지 배치를 확인하세요.</span>
                      </div>
                    </div>
                    <iframe src={previewUrl} title="PDF 미리보기" />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
