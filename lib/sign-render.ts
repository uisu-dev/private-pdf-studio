import { layoutSeal, type SealLayout } from "@/lib/seal-layout";

export const INK_COLORS = {
  black: "#1a1a1a",
  blue: "#1846b3"
} as const;

export type InkName = keyof typeof INK_COLORS;
export type SealShape = "round" | "square";

const SEAL_RED = "#c41e3a";
const SEAL_SIZE = 680;

export type RasterImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type DrawPoint = { x: number; y: number };

export type DrawStroke = {
  color: string;
  width: number;
  points: DrawPoint[];
};

export function renderSignature(name: string, family: string, weight: string, color: string): RasterImage | null {
  const text = name.trim();
  if (!text) return null;

  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return null;

  const fontSize = 180;
  const font = `${weight} ${fontSize}px "${family}"`;
  measure.font = font;
  const metrics = measure.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.82;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.18;
  const padX = Math.round(fontSize * 0.16);
  const padY = Math.round(fontSize * 0.1);
  canvas.width = Math.max(1, Math.ceil(metrics.width + padX * 2));
  canvas.height = Math.max(1, Math.ceil(ascent + descent + padY * 2));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, padX, padY + ascent);

  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export function renderSeal(input: {
  name: string;
  shape: SealShape;
  texture: boolean;
  suffixIn: boolean;
  family: string;
  weight: string;
}): RasterImage | null {
  let layout: SealLayout;
  try {
    layout = layoutSeal(input.name, input.suffixIn);
  } catch {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = SEAL_SIZE;
  canvas.height = SEAL_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, SEAL_SIZE, SEAL_SIZE);
  ctx.strokeStyle = SEAL_RED;
  ctx.fillStyle = SEAL_RED;
  ctx.lineJoin = "miter";
  ctx.miterLimit = 2;

  if (input.shape === "round") {
    strokeCircle(ctx, SEAL_SIZE / 2, SEAL_SIZE / 2, SEAL_SIZE * 0.455, SEAL_SIZE * 0.03, input.texture);
    strokeCircle(ctx, SEAL_SIZE / 2, SEAL_SIZE / 2, SEAL_SIZE * 0.395, SEAL_SIZE * 0.012, input.texture);
  } else {
    strokeSquare(ctx, SEAL_SIZE * 0.055, SEAL_SIZE * 0.89, SEAL_SIZE * 0.032, input.texture);
    strokeSquare(ctx, SEAL_SIZE * 0.115, SEAL_SIZE * 0.77, SEAL_SIZE * 0.012, input.texture);
  }

  const content = input.shape === "round"
    ? { x: SEAL_SIZE * 0.27, y: SEAL_SIZE * 0.27, width: SEAL_SIZE * 0.46, height: SEAL_SIZE * 0.46 }
    : { x: SEAL_SIZE * 0.18, y: SEAL_SIZE * 0.18, width: SEAL_SIZE * 0.64, height: SEAL_SIZE * 0.64 };
  drawSealLayout(ctx, layout, content, input.family, input.weight);

  if (input.texture) {
    applyInkTexture(ctx, SEAL_SIZE);
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: SEAL_SIZE, height: SEAL_SIZE };
}

export function paintStrokes(canvas: HTMLCanvasElement, strokes: DrawStroke[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    const [first] = stroke.points;
    ctx.moveTo(first.x, first.y);
    if (stroke.points.length === 1) {
      ctx.lineTo(first.x + 0.01, first.y);
    } else {
      for (let index = 1; index < stroke.points.length - 1; index += 1) {
        const current = stroke.points[index];
        const next = stroke.points[index + 1];
        ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }
}

export function canvasToTrimmedPng(source: HTMLCanvasElement, padding = 18): RasterImage | null {
  const ctx = source.getContext("2d");
  if (!ctx || source.width === 0 || source.height === 0) return null;
  const image = ctx.getImageData(0, 0, source.width, source.height);
  const { data } = image;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3] <= 10) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(source.width - 1, maxX + padding);
  maxY = Math.min(source.height - 1, maxY + padding);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.drawImage(source, minX, minY, width, height, 0, 0, width, height);
  return { dataUrl: out.toDataURL("image/png"), width, height };
}

function drawSealLayout(
  ctx: CanvasRenderingContext2D,
  layout: SealLayout,
  content: { x: number; y: number; width: number; height: number },
  family: string,
  weight: string
) {
  const spanColumn = layout.cells.find((cell) => cell.rowSpan > 1)?.col;
  const weightOf = (col: number) => {
    if (spanColumn === undefined || layout.columns === 1) return 1 / layout.columns;
    return col === spanColumn ? 0.58 : 0.42;
  };
  const offset: number[] = [];
  let cursor = 0;
  for (let col = 0; col < layout.columns; col += 1) {
    offset[col] = cursor;
    cursor += weightOf(col);
  }

  for (const cell of layout.cells) {
    const rowHeight = content.height / layout.rows;
    drawSealChar(ctx, cell.char, {
      x: content.x + content.width * offset[cell.col],
      y: content.y + rowHeight * cell.row,
      width: content.width * weightOf(cell.col) * cell.colSpan,
      height: rowHeight * cell.rowSpan
    }, family, weight);
  }
}

function drawSealChar(
  ctx: CanvasRenderingContext2D,
  char: string,
  rect: { x: number; y: number; width: number; height: number },
  family: string,
  weight: string
) {
  const maxW = rect.width * 0.86;
  const maxH = rect.height * 0.86;
  let size = Math.min(rect.width, rect.height) * 0.92;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SEAL_RED;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    ctx.font = `${weight} ${size}px "${family}"`;
    const metrics = ctx.measureText(char);
    const glyphWidth = Math.max(metrics.width, 1);
    const glyphHeight = Math.max(
      (metrics.actualBoundingBoxAscent || size * 0.8) + (metrics.actualBoundingBoxDescent || size * 0.2),
      1
    );
    if (glyphWidth <= maxW && glyphHeight <= maxH) break;
    size *= Math.min(maxW / glyphWidth, maxH / glyphHeight) * 0.98;
  }

  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.fillText(char, rect.x + rect.width / 2, rect.y + rect.height / 2 + size * 0.02);
}

function strokeCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  lineWidth: number,
  rough: boolean
) {
  const steps = rough ? 180 : 72;
  ctx.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const jitter = rough ? (hash(index, Math.round(radius)) - 0.5) * radius * 0.016 : 0;
    const nextRadius = radius + jitter;
    const x = cx + Math.cos(angle) * nextRadius;
    const y = cy + Math.sin(angle) * nextRadius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function strokeSquare(
  ctx: CanvasRenderingContext2D,
  inset: number,
  side: number,
  lineWidth: number,
  rough: boolean
) {
  ctx.lineWidth = lineWidth;
  if (!rough) {
    ctx.strokeRect(inset, inset, side, side);
    return;
  }

  const left = inset;
  const top = inset;
  const right = inset + side;
  const bottom = inset + side;
  const amplitude = side * 0.007;
  ctx.beginPath();
  ctx.moveTo(left, top);
  traceEdge(ctx, left, top, right, top, amplitude, 1);
  traceEdge(ctx, right, top, right, bottom, amplitude, 2);
  traceEdge(ctx, right, bottom, left, bottom, amplitude, 3);
  traceEdge(ctx, left, bottom, left, top, amplitude, 4);
  ctx.closePath();
  ctx.stroke();
}

function traceEdge(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amplitude: number,
  seed: number
) {
  const steps = 7;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const jitter = (hash(seed * 17, index) - 0.5) * amplitude;
    ctx.lineTo(x1 + dx * t + (-dy / length) * jitter, y1 + dy * t + (dx / length) * jitter);
  }
}

function applyInkTexture(ctx: CanvasRenderingContext2D, size: number) {
  const image = ctx.getImageData(0, 0, size, size);
  const src = new Uint8ClampedArray(image.data);
  const { data } = image;
  const alphaAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return 0;
    return src[(y * size + x) * 4 + 3];
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const alpha = src[index + 3];
      if (alpha === 0) continue;
      const n = hash(x, y);
      const edge = alphaAt(x - 1, y) === 0 || alphaAt(x + 1, y) === 0 || alphaAt(x, y - 1) === 0 || alphaAt(x, y + 1) === 0;
      if (edge) {
        data[index + 3] = n > 0.62 ? 0 : Math.round(alpha * (0.45 + n * 0.5));
      } else if (n > 0.985) {
        data[index + 3] = Math.round(alpha * 0.4);
      } else {
        data[index + 3] = Math.round(alpha * (0.92 + n * 0.08));
      }
      data[index] = clampChannel(data[index] + Math.round((n - 0.5) * 22));
    }
  }

  ctx.putImageData(image, 0, 0);
}

function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value));
}
