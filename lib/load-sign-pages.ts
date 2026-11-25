import { displayedSize, type PageGeometry } from "./signature-geometry";

export type SignPage = {
  index: number;
  label: number;
  previewUrl: string;
  metrics: PageGeometry;
  displayWidth: number;
  displayHeight: number;
};

export async function loadSignPages(file: File, maxEdge = 1200): Promise<SignPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const source = await pdfjs.getDocument({ data }).promise;
  const pages: SignPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const view = page.view;
      const metrics: PageGeometry = {
        viewBox: [view[0] ?? 0, view[1] ?? 0, view[2] ?? 0, view[3] ?? 0],
        rotation: page.rotate,
        userUnit: page.userUnit || 1
      };
      const fitted = displayedSize(metrics, 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(maxEdge / Math.max(base.width, base.height), 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("브라우저에서 PDF 미리보기를 사용할 수 없습니다.");

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      pages.push({
        index: pageNumber - 1,
        label: pageNumber,
        previewUrl: canvas.toDataURL("image/jpeg", 0.82),
        metrics,
        displayWidth: fitted.width,
        displayHeight: fitted.height
      });
      page.cleanup();
    }
  } finally {
    source.destroy();
  }

  if (pages.length === 0) throw new Error("페이지가 없는 PDF입니다.");
  return pages;
}
