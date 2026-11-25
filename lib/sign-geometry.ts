/**
 * Convert on-screen signature placements into pdf-lib draw coordinates.
 *
 * The preview matches a pdf.js viewport: origin at the top-left of the page
 * as displayed, x to the right, y downward, with the page /Rotate already
 * applied. pdf-lib draws in unrotated PDF user space and then the viewer
 * rotates the page. `visualRectToPdfDraw` returns the drawImage anchor,
 * size, and counter-clockwise rotation that keep the image upright.
 */

export type PageRotation = 0 | 90 | 180 | 270;

export type ViewBox = {
  /** Lower-left x of the crop box in PDF user space. */
  x: number;
  /** Lower-left y of the crop box in PDF user space. */
  y: number;
  width: number;
  height: number;
};

export type VisualRect = {
  /** Left edge in displayed-page units. Origin is the top-left, y grows downward. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfImageDraw = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Counter-clockwise degrees for pdf-lib `degrees()`. */
  rotate: PageRotation;
};

export type Matrix = [number, number, number, number, number, number];

export function normalizeRotation(rotation: number): PageRotation {
  if (!Number.isFinite(rotation)) {
    throw new Error("페이지 회전 값이 올바르지 않습니다.");
  }
  const turns = ((Math.round(rotation) % 360) + 360) % 360;
  if (turns === 0 || turns === 90 || turns === 180 || turns === 270) {
    return turns;
  }
  throw new Error(`지원하지 않는 페이지 회전입니다: ${rotation}`);
}

export function visualPageSize(viewBox: ViewBox, rotation: number, userUnit = 1) {
  assertBox(viewBox);
  const unit = assertUserUnit(userUnit);
  const rot = normalizeRotation(rotation);
  const width = (rot === 90 || rot === 270 ? viewBox.height : viewBox.width) * unit;
  const height = (rot === 90 || rot === 270 ? viewBox.width : viewBox.height) * unit;
  return { width, height };
}

/**
 * pdf.js PageViewport transform at the given scale. Viewport pixels use a
 * top-left origin. With scale 1 and userUnit 1, one viewport unit is one
 * PDF point on the displayed page.
 */
export function viewportTransform(
  viewBox: ViewBox,
  rotation: number,
  scale = 1,
  userUnit = 1
): Matrix {
  assertBox(viewBox);
  const rot = normalizeRotation(rotation);
  const unit = assertUserUnit(userUnit);
  if (!(scale > 0)) {
    throw new Error("미리보기 배율이 올바르지 않습니다.");
  }

  const xMin = viewBox.x;
  const yMin = viewBox.y;
  const xMax = viewBox.x + viewBox.width;
  const yMax = viewBox.y + viewBox.height;
  const centerX = (xMax + xMin) / 2;
  const centerY = (yMax + yMin) / 2;
  const s = scale * unit;

  let rotateA: number;
  let rotateB: number;
  let rotateC: number;
  let rotateD: number;
  switch (rot) {
    case 180:
      rotateA = -1;
      rotateB = 0;
      rotateC = 0;
      rotateD = 1;
      break;
    case 90:
      rotateA = 0;
      rotateB = 1;
      rotateC = 1;
      rotateD = 0;
      break;
    case 270:
      rotateA = 0;
      rotateB = -1;
      rotateC = -1;
      rotateD = 0;
      break;
    default:
      rotateA = 1;
      rotateB = 0;
      rotateC = 0;
      rotateD = -1;
      break;
  }

  const offsetCanvasX = (rotateA === 0 ? Math.abs(centerY - yMin) : Math.abs(centerX - xMin)) * s;
  const offsetCanvasY = (rotateA === 0 ? Math.abs(centerX - xMin) : Math.abs(centerY - yMin)) * s;

  return [
    rotateA * s,
    rotateB * s,
    rotateC * s,
    rotateD * s,
    offsetCanvasX - rotateA * s * centerX - rotateC * s * centerY,
    offsetCanvasY - rotateB * s * centerX - rotateD * s * centerY
  ];
}

export function applyInverseTransform(x: number, y: number, matrix: Matrix): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  if (det === 0) {
    throw new Error("페이지 변환을 계산할 수 없습니다.");
  }
  const pdfX = (x * d - y * c + c * f - e * d) / det;
  const pdfY = (-x * b + y * a + e * b - f * a) / det;
  return [pdfX, pdfY];
}

export function viewportPointToPdf(
  x: number,
  y: number,
  viewBox: ViewBox,
  rotation: number,
  userUnit = 1
): [number, number] {
  return applyInverseTransform(x, y, viewportTransform(viewBox, rotation, 1, userUnit));
}

/**
 * Map a rectangle on the CSS preview (pixels, top-left origin) into displayed
 * page units. `pageWidth` / `pageHeight` are the pdf.js viewport size at scale 1.
 */
export function displayRectToVisualPoints(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  pageWidth: number;
  pageHeight: number;
}): VisualRect {
  if (!(input.displayWidth > 0) || !(input.displayHeight > 0)) {
    throw new Error("미리보기 크기가 올바르지 않습니다.");
  }
  if (!(input.pageWidth > 0) || !(input.pageHeight > 0)) {
    throw new Error("페이지 크기가 올바르지 않습니다.");
  }
  const scaleX = input.pageWidth / input.displayWidth;
  const scaleY = input.pageHeight / input.displayHeight;
  return {
    x: input.x * scaleX,
    y: input.y * scaleY,
    width: input.width * scaleX,
    height: input.height * scaleY
  };
}

/** Height as a fraction of page height, preserving the image aspect ratio. */
export function placementHeightFraction(
  widthFraction: number,
  aspect: number,
  pageWidth: number,
  pageHeight: number
) {
  if (!(aspect > 0) || !(pageWidth > 0) || !(pageHeight > 0)) {
    throw new Error("서명 비율이 올바르지 않습니다.");
  }
  return (widthFraction * pageWidth) / aspect / pageHeight;
}

export function fractionPlacementToVisualPoints(input: {
  x: number;
  y: number;
  width: number;
  aspect: number;
  pageWidth: number;
  pageHeight: number;
}): VisualRect {
  const height = placementHeightFraction(input.width, input.aspect, input.pageWidth, input.pageHeight);
  return {
    x: input.x * input.pageWidth,
    y: input.y * input.pageHeight,
    width: input.width * input.pageWidth,
    height: height * input.pageHeight
  };
}

/**
 * Convert a rectangle in displayed-page units into pdf-lib `drawImage` options.
 * The rectangle origin is the top-left of the page the user sees.
 */
export function visualRectToPdfDraw(input: {
  rect: VisualRect;
  viewBox: ViewBox;
  rotation: number;
  userUnit?: number;
}): PdfImageDraw {
  const rotation = normalizeRotation(input.rotation);
  const userUnit = assertUserUnit(input.userUnit ?? 1);
  const { x, y, width, height } = input.rect;
  if (![x, y, width, height].every(Number.isFinite) || !(width > 0) || !(height > 0)) {
    throw new Error("서명 위치가 올바르지 않습니다.");
  }

  const [pdfX, pdfY] = viewportPointToPdf(x, y + height, input.viewBox, rotation, userUnit);
  return {
    x: pdfX,
    y: pdfY,
    width: width / userUnit,
    height: height / userUnit,
    rotate: rotation
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Keep a fractional placement inside the page without changing its aspect ratio. */
export function fitPlacement(input: { x: number; y: number; w: number; h: number }) {
  let { w, h } = input;
  if (![input.x, input.y, w, h].every(Number.isFinite)) {
    throw new Error("서명 위치가 올바르지 않습니다.");
  }
  const maxW = 0.96;
  const maxH = 0.96;
  if (h > maxH && h > 0) {
    w *= maxH / h;
    h = maxH;
  }
  if (w > maxW && w > 0) {
    h *= maxW / w;
    w = maxW;
  }
  w = clamp(w, 0.04, maxW);
  h = clamp(h, 0.02, maxH);
  return {
    x: clamp(input.x, 0, 1 - w),
    y: clamp(input.y, 0, 1 - h),
    w,
    h
  };
}

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

/**
 * Resize a fractional placement from a corner while preserving aspect ratio.
 * `aspect` is image width / image height. Page width and height are the
 * displayed page size in the same unit.
 */
export function resizePlacement(input: {
  corner: ResizeCorner;
  pointerX: number;
  pointerY: number;
  origin: { x: number; y: number; w: number; h: number };
  aspect: number;
  pageWidth: number;
  pageHeight: number;
}) {
  const { corner, pointerX, pointerY, origin, aspect, pageWidth, pageHeight } = input;
  if (!(aspect > 0) || !(pageWidth > 0) || !(pageHeight > 0)) {
    throw new Error("서명 비율이 올바르지 않습니다.");
  }

  const left = origin.x;
  const top = origin.y;
  const right = origin.x + origin.w;
  const bottom = origin.y + origin.h;
  const anchorX = corner === "nw" || corner === "sw" ? right : left;
  const anchorY = corner === "nw" || corner === "ne" ? bottom : top;
  const widthFromPointer = Math.abs(pointerX - anchorX);
  const heightFromPointer = Math.abs(pointerY - anchorY);
  const widthFromHeight = (heightFromPointer * pageHeight * aspect) / pageWidth;
  const w = Math.max(widthFromPointer, widthFromHeight, 0.05);
  const h = placementHeightFraction(w, aspect, pageWidth, pageHeight);
  const x = corner === "nw" || corner === "sw" ? anchorX - w : anchorX;
  const y = corner === "nw" || corner === "ne" ? anchorY - h : anchorY;
  return fitPlacement({ x, y, w, h });
}

export function signedPdfFilename(originalName: string) {
  const trimmed = originalName.trim() || "document.pdf";
  const base = trimmed.replace(/\.pdf$/i, "");
  return `${base}_서명.pdf`;
}

function assertBox(viewBox: ViewBox) {
  if (![viewBox.x, viewBox.y, viewBox.width, viewBox.height].every(Number.isFinite)) {
    throw new Error("페이지 영역이 올바르지 않습니다.");
  }
  if (!(viewBox.width > 0) || !(viewBox.height > 0)) {
    throw new Error("페이지 영역이 올바르지 않습니다.");
  }
}

function assertUserUnit(userUnit: number) {
  if (!(userUnit > 0) || !Number.isFinite(userUnit)) {
    throw new Error("페이지 단위가 올바르지 않습니다.");
  }
  return userUnit;
}
