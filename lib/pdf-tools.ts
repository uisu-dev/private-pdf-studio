import { PDFDocument } from "pdf-lib";

export type ImageFit = "contain" | "cover";
export type PageOrientation = "portrait" | "landscape";

export type ToolFile = {
  id: string;
  file: File;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export function makeId() {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export async function fileToArrayBuffer(file: File) {
  return file.arrayBuffer();
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToPngBytes(file: File) {
  const url = await fileToDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    element.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("브라우저에서 이미지 변환을 사용할 수 없습니다.");
  }
  context.drawImage(image, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("이미지 변환에 실패했습니다."));
    }, "image/png");
  });

  return blob.arrayBuffer();
}

async function embedImage(pdf: PDFDocument, file: File) {
  const bytes = await file.arrayBuffer();
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime === "image/jpeg" || mime === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return pdf.embedJpg(bytes);
  }

  if (mime === "image/png" || name.endsWith(".png")) {
    return pdf.embedPng(bytes);
  }

  const pngBytes = await fileToPngBytes(file);
  return pdf.embedPng(pngBytes);
}

export async function imagesToPdf(files: File[], fit: ImageFit, orientation: PageOrientation) {
  if (files.length === 0) {
    throw new Error("이미지를 먼저 추가해주세요.");
  }

  const pdf = await PDFDocument.create();
  const pageWidth = orientation === "landscape" ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = orientation === "landscape" ? A4_WIDTH : A4_HEIGHT;

  for (const file of files) {
    const embedded = await embedImage(pdf, file);
    const page = pdf.addPage([pageWidth, pageHeight]);
    const scale = fit === "cover"
      ? Math.max(pageWidth / embedded.width, pageHeight / embedded.height)
      : Math.min(pageWidth / embedded.width, pageHeight / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;

    page.drawImage(embedded, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height
    });
  }

  return pdf.save();
}

function parsePageSelection(input: string, pageCount: number) {
  const trimmed = input.trim();
  if (!trimmed) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-").map((value) => value.trim());
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > pageCount) {
        throw new Error(`페이지 범위를 확인해주세요: ${part}`);
      }
      for (let page = start; page <= end; page += 1) {
        const index = page - 1;
        if (!seen.has(index)) {
          pages.push(index);
          seen.add(index);
        }
      }
    } else {
      const page = Number(part);
      if (!Number.isInteger(page) || page < 1 || page > pageCount) {
        throw new Error(`페이지 번호를 확인해주세요: ${part}`);
      }
      const index = page - 1;
      if (!seen.has(index)) {
        pages.push(index);
        seen.add(index);
      }
    }
  }

  if (pages.length === 0) {
    throw new Error("내보낼 페이지를 입력해주세요.");
  }

  return pages;
}

export async function splitPdf(file: File, selection: string) {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const selectedPages = parsePageSelection(selection, source.getPageCount());
  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(source, selectedPages);

  copiedPages.forEach((page) => output.addPage(page));

  return {
    bytes: await output.save(),
    pageCount: source.getPageCount(),
    selectedCount: selectedPages.length
  };
}

export async function mergePdfs(files: File[]) {
  if (files.length === 0) {
    throw new Error("PDF 파일을 먼저 추가해주세요.");
  }

  const output = await PDFDocument.create();

  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await output.copyPages(
      source,
      Array.from({ length: source.getPageCount() }, (_, index) => index)
    );
    pages.forEach((page) => output.addPage(page));
  }

  return output.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
