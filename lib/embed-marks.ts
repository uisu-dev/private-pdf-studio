import { PDFDocument, radians, type PDFImage } from "pdf-lib";
import {
  displayedSize,
  heightFractionForWidth,
  placementToDrawImage,
  type PageGeometry
} from "./signature-geometry.ts";

export type EmbedMark = {
  pageIndex: number;
  imageKey: string;
  pngBytes: Uint8Array;
  nx: number;
  ny: number;
  nw: number;
  rotation: number;
  pixelWidth: number;
  pixelHeight: number;
};

export async function embedSignatureImages(pdfBytes: Uint8Array, pages: PageGeometry[], marks: EmbedMark[]) {
  if (marks.length === 0) {
    throw new Error("페이지에 올린 서명이나 도장이 없습니다.");
  }

  const pdf = await PDFDocument.load(pdfBytes.slice());
  if (pdf.getPageCount() !== pages.length) {
    throw new Error("PDF 페이지 정보가 맞지 않습니다. 파일을 다시 열어 주세요.");
  }

  const embedded = new Map<string, PDFImage>();

  for (const mark of marks) {
    if (!Number.isInteger(mark.pageIndex) || mark.pageIndex < 0 || mark.pageIndex >= pages.length) {
      throw new Error("서명 위치가 페이지 범위를 벗어났습니다.");
    }
    const metrics = pages[mark.pageIndex];
    if (!metrics) throw new Error("PDF 페이지 정보가 맞지 않습니다. 파일을 다시 열어 주세요.");

    let image = embedded.get(mark.imageKey);
    if (!image) {
      image = await pdf.embedPng(mark.pngBytes);
      embedded.set(mark.imageKey, image);
    }

    const size = displayedSize(metrics, 1);
    const aspect = mark.pixelWidth / mark.pixelHeight;
    const draw = placementToDrawImage(metrics, {
      x: mark.nx,
      y: mark.ny,
      width: mark.nw,
      height: heightFractionForWidth(mark.nw, size.width, size.height, aspect),
      rotation: mark.rotation
    });

    pdf.getPage(mark.pageIndex).drawImage(image, {
      x: draw.x,
      y: draw.y,
      width: draw.width,
      height: draw.height,
      rotate: radians(draw.rotateRadians)
    });
  }

  return pdf.save();
}
