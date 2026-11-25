import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createViewport,
  clientPointToNormalized,
  displayedSize,
  heightFractionForWidth,
  normalizeDegrees,
  pdfDrawImageCenter,
  pdfDrawImageLocalPoint,
  pdfPointToViewport,
  placementToDrawImage,
  viewportPointToPdf,
  type NormalizedPlacement,
  type PageGeometry
} from "./signature-geometry.ts";

const letter: PageGeometry = { viewBox: [0, 0, 612, 792], rotation: 0, userUnit: 1 };

function close(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected} but got ${actual}`
  );
}

function closePair(actual: readonly [number, number], expected: readonly [number, number], epsilon = 1e-6) {
  close(actual[0], expected[0], epsilon);
  close(actual[1], expected[1], epsilon);
}

test("viewport matches pdf.js for rotation, scale, and a shifted view box", () => {
  const cases: Array<{
    metrics: PageGeometry;
    scale: number;
    width: number;
    height: number;
    transform: [number, number, number, number, number, number];
    origin: [number, number];
    far: [number, number];
  }> = [
    {
      metrics: letter,
      scale: 1,
      width: 612,
      height: 792,
      transform: [1, 0, 0, -1, 0, 792],
      origin: [0, 792],
      far: [612, 0]
    },
    {
      metrics: { viewBox: [0, 0, 612, 792], rotation: 90, userUnit: 1 },
      scale: 1,
      width: 792,
      height: 612,
      transform: [0, 1, 1, 0, 0, 0],
      origin: [0, 0],
      far: [612, 792]
    },
    {
      metrics: { viewBox: [0, 0, 400, 500], rotation: 180, userUnit: 1 },
      scale: 1,
      width: 400,
      height: 500,
      transform: [-1, 0, 0, 1, 400, 0],
      origin: [400, 0],
      far: [0, 500]
    },
    {
      metrics: { viewBox: [0, 0, 400, 500], rotation: 270, userUnit: 1 },
      scale: 1,
      width: 500,
      height: 400,
      transform: [0, -1, -1, 0, 500, 400],
      origin: [400, 500],
      far: [0, 0]
    },
    {
      metrics: { viewBox: [10, 20, 600, 800], rotation: 0, userUnit: 1 },
      scale: 1,
      width: 590,
      height: 780,
      transform: [1, 0, 0, -1, -10, 800],
      origin: [10, 800],
      far: [600, 20]
    }
  ];

  for (const item of cases) {
    const viewport = createViewport(item.metrics, item.scale);
    assert.deepEqual(viewport.transform.map((value) => Number(value.toFixed(6))), item.transform);
    close(viewport.width, item.width);
    close(viewport.height, item.height);
    closePair(viewportPointToPdf(item.metrics, item.scale, 0, 0), item.origin);
    closePair(viewportPointToPdf(item.metrics, item.scale, item.width, item.height), item.far);
  }
});

test("negative page rotation uses the same transform as pdf.js", () => {
  const negative = createViewport({ viewBox: [0, 0, 400, 500], rotation: -90, userUnit: 1 }, 1);
  const positive = createViewport({ viewBox: [0, 0, 400, 500], rotation: 270, userUnit: 1 }, 1);
  assert.deepEqual(negative.transform, positive.transform);
  assert.equal(negative.rotation, 270);
});

test("viewport pixels scale without moving the PDF point", () => {
  closePair(viewportPointToPdf(letter, 1, 120, 80), viewportPointToPdf(letter, 2, 240, 160));
  closePair(pdfPointToViewport(letter, 2, 120, 80), [240, (792 - 80) * 2]);
});

test("user unit changes the displayed size and keeps user-space points", () => {
  const metrics: PageGeometry = { viewBox: [0, 0, 100, 200], rotation: 0, userUnit: 2 };
  const size = displayedSize(metrics, 1);
  close(size.width, 200);
  close(size.height, 400);
  closePair(viewportPointToPdf(metrics, 1, 0, 0), [0, 200]);
});

test("top-left placement on an upright page becomes a pdf-lib lower-left", () => {
  const draw = placementToDrawImage(letter, {
    x: 0,
    y: 0,
    width: 100 / 612,
    height: 50 / 792,
    rotation: 0
  });
  close(draw.x, 0);
  close(draw.y, 742);
  close(draw.width, 100);
  close(draw.height, 50);
  close(draw.rotateRadians, 0);
});

test("top-left placement on a page rotated 90 degrees", () => {
  const draw = placementToDrawImage(
    { viewBox: [0, 0, 612, 792], rotation: 90, userUnit: 1 },
    { x: 0, y: 0, width: 100 / 792, height: 50 / 612, rotation: 0 }
  );
  close(draw.x, 50);
  close(draw.y, 0);
  close(draw.width, 100);
  close(draw.height, 50);
  close(draw.rotateRadians, Math.PI / 2);
});

test("placed image keeps its center, width, and height on screen", () => {
  const pages: PageGeometry[] = [
    letter,
    { viewBox: [0, 0, 612, 792], rotation: 90, userUnit: 1 },
    { viewBox: [0, 0, 400, 500], rotation: 180, userUnit: 1 },
    { viewBox: [0, 0, 400, 500], rotation: 270, userUnit: 1 },
    { viewBox: [10, 20, 600, 800], rotation: 0, userUnit: 1 }
  ];
  const placements: NormalizedPlacement[] = [
    { x: 0.1, y: 0.2, width: 0.3, height: 0.12, rotation: 0 },
    { x: 0.05, y: 0.08, width: 0.25, height: 0.18, rotation: 90 },
    { x: 0.2, y: 0.35, width: 0.22, height: 0.1, rotation: -35 },
    { x: 0, y: 0, width: 0.4, height: 0.15, rotation: 180 }
  ];

  for (const metrics of pages) {
    const viewport = createViewport(metrics, 1);
    for (const placement of placements) {
      const draw = placementToDrawImage(metrics, placement);
      const displayWidth = placement.width * viewport.width;
      const displayHeight = placement.height * viewport.height;
      const visualCenter: [number, number] = [
        placement.x * viewport.width + displayWidth / 2,
        placement.y * viewport.height + displayHeight / 2
      ];
      const center = pdfDrawImageCenter(draw);
      closePair(pdfPointToViewport(metrics, 1, center[0], center[1]), visualCenter, 1e-4);

      const left = pdfDrawImageLocalPoint(draw, 0, draw.height / 2);
      const right = pdfDrawImageLocalPoint(draw, draw.width, draw.height / 2);
      const top = pdfDrawImageLocalPoint(draw, draw.width / 2, draw.height);
      const bottom = pdfDrawImageLocalPoint(draw, draw.width / 2, 0);
      const viewLeft = pdfPointToViewport(metrics, 1, left[0], left[1]);
      const viewRight = pdfPointToViewport(metrics, 1, right[0], right[1]);
      const viewTop = pdfPointToViewport(metrics, 1, top[0], top[1]);
      const viewBottom = pdfPointToViewport(metrics, 1, bottom[0], bottom[1]);
      close(Math.hypot(viewRight[0] - viewLeft[0], viewRight[1] - viewLeft[1]), displayWidth, 1e-4);
      close(Math.hypot(viewBottom[0] - viewTop[0], viewBottom[1] - viewTop[1]), displayHeight, 1e-4);
    }
  }
});

test("pointer position uses the rendered element box, not the PDF scale", () => {
  assert.deepEqual(clientPointToNormalized(110, 120, { left: 10, top: 20, width: 200, height: 400 }), {
    x: 0.5,
    y: 0.25
  });
  assert.deepEqual(clientPointToNormalized(5, 5, { left: 0, top: 0, width: 0, height: 0 }), { x: 0, y: 0 });
});

test("height fraction preserves image aspect", () => {
  close(heightFractionForWidth(0.5, 612, 792, 3), (0.5 * 612) / (792 * 3));
  close(heightFractionForWidth(0.2, 792, 612, 1), (0.2 * 792) / 612);
});

test("degrees wrap into the slider range", () => {
  assert.equal(normalizeDegrees(0), 0);
  assert.equal(normalizeDegrees(270), -90);
  assert.equal(normalizeDegrees(-90), -90);
  assert.equal(normalizeDegrees(181), -179);
  assert.equal(normalizeDegrees(Number.NaN), 0);
});

test("invalid page rotation is rejected", () => {
  assert.throws(
    () => createViewport({ viewBox: [0, 0, 100, 100], rotation: 45, userUnit: 1 }, 1),
    /90도/
  );
});

test("pdf.js PageViewport agrees with the pure transform", async () => {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        const [a, b, c, d, e, f] = init;
        this.a = a ?? 1;
        this.b = b ?? 0;
        this.c = c ?? 0;
        this.d = d ?? 1;
        this.e = e ?? 0;
        this.f = f ?? 0;
      }
    }
  }
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixPolyfill;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const rotated = doc.addPage([612, 792]);
  rotated.setRotation(degrees(90));
  const half = doc.addPage([400, 500]);
  half.setRotation(degrees(180));
  const three = doc.addPage([400, 500]);
  three.setRotation(degrees(270));
  doc.addPage([600, 800]);
  const bytes = await doc.save();
  const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const metrics: PageGeometry = {
      viewBox: [page.view[0], page.view[1], page.view[2], page.view[3]],
      rotation: page.rotate,
      userUnit: page.userUnit || 1
    };
    for (const scale of [1, 1.75]) {
      const viewport = page.getViewport({ scale });
      const ours = createViewport(metrics, scale);
      close(ours.width, viewport.width, 1e-6);
      close(ours.height, viewport.height, 1e-6);
      const samples = [
        [0, 0],
        [viewport.width, 0],
        [0, viewport.height],
        [viewport.width / 2, viewport.height / 3]
      ];
      for (const [x, y] of samples) {
        closePair(viewportPointToPdf(metrics, scale, x ?? 0, y ?? 0), viewport.convertToPdfPoint(x, y), 1e-4);
      }
    }
  }
});
