import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, degrees } from "pdf-lib";
import { layoutSeal, sealGraphemes } from "./seal-layout.ts";
import {
  applyInverseTransform,
  displayRectToVisualPoints,
  fitPlacement,
  fractionPlacementToVisualPoints,
  normalizeRotation,
  placementHeightFraction,
  resizePlacement,
  signedPdfFilename,
  viewportPointToPdf,
  viewportTransform,
  visualPageSize,
  visualRectToPdfDraw,
  type Matrix,
  type ViewBox
} from "./sign-geometry.ts";

const A4: ViewBox = { x: 0, y: 0, width: 595.28, height: 841.89 };

function closeTo(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`
  );
}

test("normalizeRotation wraps full turns and rejects odd angles", () => {
  assert.equal(normalizeRotation(0), 0);
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(180.2), 180);
  assert.throws(() => normalizeRotation(45), /회전/);
});

test("visual page size swaps axes for 90 and 270 degrees", () => {
  assert.deepEqual(visualPageSize(A4, 0), { width: A4.width, height: A4.height });
  assert.deepEqual(visualPageSize(A4, 90), { width: A4.height, height: A4.width });
  assert.deepEqual(visualPageSize(A4, 270, 2), {
    width: A4.height * 2,
    height: A4.width * 2
  });
});

test("display pixels scale independently onto the page", () => {
  const rect = displayRectToVisualPoints({
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    displayWidth: 500,
    displayHeight: 700,
    pageWidth: 250,
    pageHeight: 350
  });
  closeTo(rect.x, 5);
  closeTo(rect.y, 10);
  closeTo(rect.width, 15);
  closeTo(rect.height, 20);
});

test("fraction placement keeps the image aspect ratio", () => {
  const pageWidth = 842;
  const pageHeight = 595;
  const rect = fractionPlacementToVisualPoints({
    x: 0.1,
    y: 0.2,
    width: 0.25,
    aspect: 2,
    pageWidth,
    pageHeight
  });
  closeTo(rect.x, 84.2);
  closeTo(rect.y, 119);
  closeTo(rect.width, 210.5);
  closeTo(rect.height, 105.25);
  closeTo(placementHeightFraction(0.25, 2, pageWidth, pageHeight), 105.25 / pageHeight);
});

test("rotation 0 draws from the visual bottom-left", () => {
  const draw = visualRectToPdfDraw({
    rect: { x: 100, y: 50, width: 80, height: 40 },
    viewBox: A4,
    rotation: 0
  });
  closeTo(draw.x, 100);
  closeTo(draw.y, A4.height - 50 - 40);
  closeTo(draw.width, 80);
  closeTo(draw.height, 40);
  assert.equal(draw.rotate, 0);
});

test("rotation 90, 180, and 270 stay upright in user space", () => {
  const rect = { x: 30, y: 40, width: 50, height: 20 };

  const turned90 = visualRectToPdfDraw({ rect, viewBox: A4, rotation: 90 });
  closeTo(turned90.x, rect.y + rect.height);
  closeTo(turned90.y, rect.x);
  assert.equal(turned90.rotate, 90);

  const turned180 = visualRectToPdfDraw({ rect, viewBox: A4, rotation: 180 });
  closeTo(turned180.x, A4.width - rect.x);
  closeTo(turned180.y, rect.y + rect.height);
  assert.equal(turned180.rotate, 180);

  const turned270 = visualRectToPdfDraw({ rect, viewBox: A4, rotation: 270 });
  closeTo(turned270.x, A4.width - rect.y - rect.height);
  closeTo(turned270.y, A4.height - rect.x);
  assert.equal(turned270.rotate, 270);
});

test("a shifted crop box moves the anchor with it", () => {
  const viewBox: ViewBox = { x: 10, y: 20, width: 500, height: 700 };
  const draw = visualRectToPdfDraw({
    rect: { x: 30, y: 40, width: 50, height: 20 },
    viewBox,
    rotation: 0
  });
  closeTo(draw.x, 40);
  closeTo(draw.y, 660);
  closeTo(draw.width, 50);
  closeTo(draw.height, 20);
});

test("userUnit converts viewport pixels back to PDF user space", () => {
  const draw = visualRectToPdfDraw({
    rect: { x: 20, y: 30, width: 40, height: 10 },
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    rotation: 0,
    userUnit: 2
  });
  closeTo(draw.x, 10);
  closeTo(draw.y, 80);
  closeTo(draw.width, 20);
  closeTo(draw.height, 5);
});

test("rotated fraction placement matches the 90-degree anchor", () => {
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const rect = fractionPlacementToVisualPoints({
    x: 0.1,
    y: 0.2,
    width: 0.25,
    aspect: 2,
    pageWidth,
    pageHeight
  });
  const draw = visualRectToPdfDraw({
    rect,
    viewBox: { x: 0, y: 0, width: pageHeight, height: pageWidth },
    rotation: 90
  });
  closeTo(draw.x, rect.y + rect.height);
  closeTo(draw.y, rect.x);
  closeTo(draw.width, rect.width);
  closeTo(draw.height, rect.height);
  assert.equal(draw.rotate, 90);
});

test("display scale and rotation compose", () => {
  const viewBox = A4;
  const page = visualPageSize(viewBox, 180);
  const rect = displayRectToVisualPoints({
    x: 40,
    y: 25,
    width: 80,
    height: 20,
    displayWidth: page.width / 2,
    displayHeight: page.height / 2,
    pageWidth: page.width,
    pageHeight: page.height
  });
  const draw = visualRectToPdfDraw({ rect, viewBox, rotation: 180 });
  closeTo(rect.x, 80);
  closeTo(rect.y, 50);
  closeTo(draw.x, A4.width - 80);
  closeTo(draw.y, 50 + 40);
  assert.equal(draw.rotate, 180);
});

test("fitPlacement pulls a mark back inside the page", () => {
  const fitted = fitPlacement({ x: 0.9, y: -0.2, w: 0.3, h: 0.2 });
  closeTo(fitted.w, 0.3);
  closeTo(fitted.h, 0.2);
  closeTo(fitted.x, 0.7);
  closeTo(fitted.y, 0);
});

test("resize from the south-east corner keeps the opposite corner fixed", () => {
  const next = resizePlacement({
    corner: "se",
    pointerX: 0.7,
    pointerY: 0.55,
    origin: { x: 0.2, y: 0.1, w: 0.2, h: 0.2 },
    aspect: 1,
    pageWidth: 400,
    pageHeight: 400
  });
  closeTo(next.x, 0.2);
  closeTo(next.y, 0.1);
  closeTo(next.w, 0.5);
  closeTo(next.h, 0.5);
});

test("signed PDF filename keeps the original stem", () => {
  assert.equal(signedPdfFilename("계약서.PDF"), "계약서_서명.pdf");
  assert.equal(signedPdfFilename("  "), "document_서명.pdf");
});

test("seal graphemes count Hangul syllables and ignore spaces", () => {
  assert.deepEqual(sealGraphemes(" 홍 길동 "), ["홍", "길", "동"]);
});

test("seal layout follows an in-jang grid", () => {
  const two = layoutSeal("김수", false);
  assert.deepEqual(two.cells.map((cell) => cell.char), ["김", "수"]);

  const three = layoutSeal("홍길동", false);
  assert.equal(three.cells.find((cell) => cell.char === "홍")?.col, 1);
  assert.equal(three.cells.find((cell) => cell.char === "홍")?.rowSpan, 2);
  assert.equal(three.cells.find((cell) => cell.char === "길")?.row, 0);
  assert.equal(three.cells.find((cell) => cell.char === "동")?.row, 1);

  const withIn = layoutSeal("홍길동", true);
  assert.equal(withIn.cells.find((cell) => cell.char === "인")?.col, 1);
  assert.equal(withIn.cells.find((cell) => cell.char === "인")?.row, 1);
  assert.equal(withIn.cells.find((cell) => cell.char === "길")?.col, 0);

  const four = layoutSeal("김수한무", false);
  assert.equal(four.cells.find((cell) => cell.char === "김")?.col, 1);
  assert.equal(four.cells.find((cell) => cell.char === "수")?.row, 1);
  assert.equal(four.cells.find((cell) => cell.char === "한")?.col, 0);
  assert.equal(four.cells.find((cell) => cell.char === "무")?.row, 1);

  assert.throws(() => layoutSeal("김", false), /2자에서 4자/);
  assert.throws(() => layoutSeal("김수", true), /세 글자/);
});

function imagePoint(drawX: number, drawY: number, width: number, height: number, rotate: number, lx: number, ly: number) {
  const theta = (rotate * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [
    drawX + lx * width * cos - ly * height * sin,
    drawY + lx * width * sin + ly * height * cos
  ];
}

test("draw options land on the same corners pdf.js would display", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const cases: Array<{ rotation: number; crop?: ViewBox; size: [number, number] }> = [
    { rotation: 0, size: [595.28, 841.89] },
    { rotation: 90, size: [595.28, 841.89] },
    { rotation: 180, size: [612, 792] },
    { rotation: 270, size: [500, 640] },
    { rotation: 90, size: [620, 800], crop: { x: 36, y: 48, width: 500, height: 680 } },
    { rotation: 0, size: [640, 480], crop: { x: 12, y: 18, width: 400, height: 300 } }
  ];

  for (const sample of cases) {
    const doc = await PDFDocument.create();
    const page = doc.addPage(sample.size);
    page.setRotation(degrees(sample.rotation));
    if (sample.crop) {
      page.setCropBox(sample.crop.x, sample.crop.y, sample.crop.width, sample.crop.height);
    }
    const bytes = await doc.save();
    const loaded = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
    const pdfPage = await loaded.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const view = pdfPage.view;
    const viewBox: ViewBox = {
      x: view[0],
      y: view[1],
      width: view[2] - view[0],
      height: view[3] - view[1]
    };
    const expectedSize = visualPageSize(viewBox, pdfPage.rotate, pdfPage.userUnit);
    closeTo(viewport.width, expectedSize.width, 0.02);
    closeTo(viewport.height, expectedSize.height, 0.02);

    const rect = {
      x: viewport.width * 0.18,
      y: viewport.height * 0.22,
      width: viewport.width * 0.27,
      height: viewport.height * 0.11
    };
    const draw = visualRectToPdfDraw({
      rect,
      viewBox,
      rotation: pdfPage.rotate,
      userUnit: pdfPage.userUnit
    });
    const [anchorX, anchorY] = viewport.convertToPdfPoint(rect.x, rect.y + rect.height);
    closeTo(draw.x, anchorX, 0.02);
    closeTo(draw.y, anchorY, 0.02);

    const corners: Array<[number, number, number, number]> = [
      [0, 0, rect.x, rect.y + rect.height],
      [1, 0, rect.x + rect.width, rect.y + rect.height],
      [0, 1, rect.x, rect.y],
      [1, 1, rect.x + rect.width, rect.y]
    ];
    for (const [lx, ly, visualX, visualY] of corners) {
      const [userX, userY] = imagePoint(draw.x, draw.y, draw.width, draw.height, draw.rotate, lx, ly);
      const [expectedX, expectedY] = viewport.convertToPdfPoint(visualX, visualY);
      closeTo(userX, expectedX, 0.05);
      closeTo(userY, expectedY, 0.05);
    }

    const matrix = viewportTransform(viewBox, pdfPage.rotate, 1, pdfPage.userUnit) as Matrix;
    const [roundX, roundY] = applyInverseTransform(rect.x, rect.y, matrix);
    const [pdfX, pdfY] = viewport.convertToPdfPoint(rect.x, rect.y);
    closeTo(roundX, pdfX, 0.02);
    closeTo(roundY, pdfY, 0.02);
    const direct = viewportPointToPdf(rect.x, rect.y, viewBox, pdfPage.rotate, pdfPage.userUnit);
    closeTo(direct[0], pdfX, 0.02);
    closeTo(direct[1], pdfY, 0.02);

    await loaded.destroy();
  }
});
