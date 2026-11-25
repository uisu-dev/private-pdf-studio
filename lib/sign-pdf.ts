import { PDFDocument, degrees, type PDFImage } from "pdf-lib";
import {
  fractionPlacementToVisualPoints,
  normalizeRotation,
  signedPdfFilename,
  visualRectToPdfDraw,
  type PageRotation,
  type ViewBox
} from "@/lib/sign-geometry";

export type SignPage = {
  pageIndex: number;
  previewUrl: string;
  viewBox: ViewBox;
  rotation: PageRotation;
  userUnit: number;
  visualWidth: number;
  visualHeight: number;
};

export type SignPlacement = {
  pageIndex: number;
  dataUrl: string;
  aspect: number;
  x: number;
  y: number;
  w: number;
};

export { signedPdfFilename };

export async function loadSignDocument(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const original = await file.arrayBuffer();
  const bytes = original.slice(0);
  const source = await pdfjs.getDocument({ data: new Uint8Array(original.slice(0)) }).promise;
  const pages: SignPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1100 / base.width, 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("브라우저에서 PDF 미리보기를 사용할 수 없습니다.");
      }

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const view = page.view;
      pages.push({
        pageIndex: pageNumber - 1,
        previewUrl: canvas.toDataURL("image/jpeg", 0.84),
        viewBox: {
          x: view[0],
          y: view[1],
          width: view[2] - view[0],
          height: view[3] - view[1]
        },
        rotation: normalizeRotation(page.rotate),
        userUnit: page.userUnit || 1,
        visualWidth: base.width,
        visualHeight: base.height
      });
      page.cleanup();
    }
  } finally {
    await source.destroy();
  }

  return { bytes, pages };
}

export async function embedPlacements(pdfBytes: ArrayBuffer, pages: SignPage[], placements: SignPlacement[]) {
  if (placements.length === 0) {
    throw new Error("페이지에 올릴 서명이나 도장이 없습니다.");
  }

  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const images = new Map<string, PDFImage>();

  for (const placement of placements) {
    const info = pages[placement.pageIndex];
    if (!info || placement.pageIndex >= pdf.getPageCount()) {
      throw new Error("서명 위치를 페이지에 맞추지 못했습니다.");
    }

    let image = images.get(placement.dataUrl);
    if (!image) {
      image = await pdf.embedPng(dataUrlToBytes(placement.dataUrl));
      images.set(placement.dataUrl, image);
    }

    const rect = fractionPlacementToVisualPoints({
      x: placement.x,
      y: placement.y,
      width: placement.w,
      aspect: placement.aspect,
      pageWidth: info.visualWidth,
      pageHeight: info.visualHeight
    });
    const draw = visualRectToPdfDraw({
      rect,
      viewBox: info.viewBox,
      rotation: info.rotation,
      userUnit: info.userUnit
    });

    pdf.getPage(placement.pageIndex).drawImage(image, {
      x: draw.x,
      y: draw.y,
      width: draw.width,
      height: draw.height,
      rotate: degrees(draw.rotate)
    });
  }

  return pdf.save();
}

export function dataUrlToBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("이미지 데이터가 올바르지 않습니다.");
  }
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
