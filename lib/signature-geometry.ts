/**
 * Maps a mark on the on-screen PDF page to pdf-lib's drawImage coordinates.
 *
 * The viewport math follows PDF.js PageViewport (pdfjs-dist 5.7): origin is the
 * top-left of the displayed page, y grows downward, and /Rotate is applied.
 * pdf-lib then draws in unrotated user space, rotating the image counter-clockwise
 * around its lower-left after scaling.
 */

export type Matrix = [number, number, number, number, number, number];

export type PageGeometry = {
  /** Crop/view box as [xMin, yMin, xMax, yMax] in PDF user space. */
  viewBox: [number, number, number, number];
  /** Clockwise page rotation in degrees. */
  rotation: number;
  /** PDF user unit. 1 matches the default user space. */
  userUnit: number;
};

export type Viewport = {
  transform: Matrix;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  viewBox: [number, number, number, number];
  userUnit: number;
};

export type NormalizedPlacement = {
  /** Left edge as a fraction of the displayed page width. */
  x: number;
  /** Top edge as a fraction of the displayed page height. Y grows downward. */
  y: number;
  /** Unrotated width as a fraction of the displayed page width. */
  width: number;
  /** Unrotated height as a fraction of the displayed page height. */
  height: number;
  /** Clockwise degrees around the mark center, in displayed space. */
  rotation: number;
};

export type PdfDrawImage = {
  /** Lower-left x in PDF user space, before the image's own rotation. */
  x: number;
  /** Lower-left y in PDF user space. */
  y: number;
  width: number;
  height: number;
  /** Counter-clockwise radians around the lower-left. Matches pdf-lib. */
  rotateRadians: number;
};

export function createViewport(metrics: PageGeometry, scale: number): Viewport {
  const viewBox = metrics.viewBox;
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
    throw new Error("PDF 페이지 크기를 읽지 못했습니다.");
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("PDF 배율이 올바르지 않습니다.");
  }

  const userUnit = Number.isFinite(metrics.userUnit) && metrics.userUnit > 0 ? metrics.userUnit : 1;
  let rotation = metrics.rotation % 360;
  if (rotation < 0) rotation += 360;

  const centerX = (viewBox[2] + viewBox[0]) / 2;
  const centerY = (viewBox[3] + viewBox[1]) / 2;
  let rotateA: number;
  let rotateB: number;
  let rotateC: number;
  let rotateD: number;

  switch (rotation) {
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
    case 0:
      rotateA = 1;
      rotateB = 0;
      rotateC = 0;
      rotateD = -1;
      break;
    default:
      throw new Error("페이지 회전 값은 90도 단위여야 합니다.");
  }

  const unitScale = scale * userUnit;
  let offsetCanvasX: number;
  let offsetCanvasY: number;
  let width: number;
  let height: number;

  if (rotateA === 0) {
    offsetCanvasX = Math.abs(centerY - viewBox[1]) * unitScale;
    offsetCanvasY = Math.abs(centerX - viewBox[0]) * unitScale;
    width = (viewBox[3] - viewBox[1]) * unitScale;
    height = (viewBox[2] - viewBox[0]) * unitScale;
  } else {
    offsetCanvasX = Math.abs(centerX - viewBox[0]) * unitScale;
    offsetCanvasY = Math.abs(centerY - viewBox[1]) * unitScale;
    width = (viewBox[2] - viewBox[0]) * unitScale;
    height = (viewBox[3] - viewBox[1]) * unitScale;
  }

  const transform: Matrix = [
    rotateA * unitScale,
    rotateB * unitScale,
    rotateC * unitScale,
    rotateD * unitScale,
    offsetCanvasX - rotateA * unitScale * centerX - rotateC * unitScale * centerY,
    offsetCanvasY - rotateB * unitScale * centerX - rotateD * unitScale * centerY
  ];

  return {
    transform,
    width,
    height,
    scale,
    rotation,
    viewBox,
    userUnit
  };
}

export function displayedSize(metrics: PageGeometry, scale = 1) {
  const viewport = createViewport(metrics, scale);
  return { width: viewport.width, height: viewport.height };
}

export function applyTransform(matrix: Matrix, x: number, y: number): [number, number] {
  return [x * matrix[0] + y * matrix[2] + matrix[4], x * matrix[1] + y * matrix[3] + matrix[5]];
}

export function applyInverseTransform(matrix: Matrix, x: number, y: number): [number, number] {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (determinant === 0) {
    throw new Error("PDF 좌표를 변환할 수 없습니다.");
  }
  return [
    (x * matrix[3] - y * matrix[2] + matrix[2] * matrix[5] - matrix[4] * matrix[3]) / determinant,
    (-x * matrix[1] + y * matrix[0] + matrix[4] * matrix[1] - matrix[5] * matrix[0]) / determinant
  ];
}

export function viewportPointToPdf(metrics: PageGeometry, scale: number, x: number, y: number): [number, number] {
  return applyInverseTransform(createViewport(metrics, scale).transform, x, y);
}

export function pdfPointToViewport(metrics: PageGeometry, scale: number, x: number, y: number): [number, number] {
  return applyTransform(createViewport(metrics, scale).transform, x, y);
}

export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
) {
  return {
    x: rect.width === 0 ? 0 : (clientX - rect.left) / rect.width,
    y: rect.height === 0 ? 0 : (clientY - rect.top) / rect.height
  };
}

/** Keeps an image's pixel aspect when width is stored as a fraction of the page width. */
export function heightFractionForWidth(
  widthFraction: number,
  pageWidth: number,
  pageHeight: number,
  imageAspect: number
) {
  if (pageWidth <= 0 || pageHeight <= 0 || imageAspect <= 0) return widthFraction;
  return (widthFraction * pageWidth) / (pageHeight * imageAspect);
}

export function normalizeDegrees(value: number) {
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

function localPointToPdf(draw: PdfDrawImage, localX: number, localY: number): [number, number] {
  const cos = Math.cos(draw.rotateRadians);
  const sin = Math.sin(draw.rotateRadians);
  return [
    draw.x + localX * cos - localY * sin,
    draw.y + localX * sin + localY * cos
  ];
}

export function placementToDrawImage(metrics: PageGeometry, placement: NormalizedPlacement): PdfDrawImage {
  const viewport = createViewport(metrics, 1);
  const displayWidth = placement.width * viewport.width;
  const displayHeight = placement.height * viewport.height;
  const centerX = placement.x * viewport.width + displayWidth / 2;
  const centerY = placement.y * viewport.height + displayHeight / 2;

  const radiansClockwise = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(radiansClockwise);
  const sin = Math.sin(radiansClockwise);
  const halfWidth = displayWidth / 2;
  const halfHeight = displayHeight / 2;

  const [pdfCenterX, pdfCenterY] = applyInverseTransform(viewport.transform, centerX, centerY);
  const [pdfRightX, pdfRightY] = applyInverseTransform(
    viewport.transform,
    centerX + cos * halfWidth,
    centerY + sin * halfWidth
  );
  const [pdfBottomX, pdfBottomY] = applyInverseTransform(
    viewport.transform,
    centerX - sin * halfHeight,
    centerY + cos * halfHeight
  );

  const axisX = pdfRightX - pdfCenterX;
  const axisY = pdfRightY - pdfCenterY;
  const width = Math.hypot(axisX, axisY) * 2;
  const height = Math.hypot(pdfCenterX - pdfBottomX, pdfCenterY - pdfBottomY) * 2;
  const rotateRadians = width === 0 && height === 0 ? 0 : Math.atan2(axisY, axisX);
  const cosR = Math.cos(rotateRadians);
  const sinR = Math.sin(rotateRadians);

  return {
    x: pdfCenterX - (cosR * (width / 2) - sinR * (height / 2)),
    y: pdfCenterY - (sinR * (width / 2) + cosR * (height / 2)),
    width,
    height,
    rotateRadians
  };
}

/** Center of an image after pdf-lib scales, rotates around the lower-left, then translates. */
export function pdfDrawImageCenter(draw: PdfDrawImage): [number, number] {
  return localPointToPdf(draw, draw.width / 2, draw.height / 2);
}

export function pdfDrawImageLocalPoint(draw: PdfDrawImage, localX: number, localY: number): [number, number] {
  return localPointToPdf(draw, localX, localY);
}
