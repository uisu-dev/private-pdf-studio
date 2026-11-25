import { layoutSealGlyphs, type SealLayout } from "./seal-layout";

export type Raster = {
  dataUrl: string;
  pngBytes: Uint8Array;
  width: number;
  height: number;
};

export type StampShape = "circle" | "square" | "ellipse" | "round-rect";
export type StampRelief = "yang" | "yin";

export function dataUrlToBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function canvasToRaster(canvas: HTMLCanvasElement): Raster {
  const dataUrl = canvas.toDataURL("image/png");
  return {
    dataUrl,
    pngBytes: dataUrlToBytes(dataUrl),
    width: canvas.width,
    height: canvas.height
  };
}

function quoteFamily(family: string) {
  return family
    .split(",")
    .map((part) => `"${part.trim().replace(/^["']|["']$/g, "")}"`)
    .filter((part) => part !== '""')
    .join(", ");
}

function fontCss(size: number, family: string, fallback: string) {
  return `400 ${size}px ${quoteFamily(family)}, ${quoteFamily(fallback)}`;
}

function requireContext(canvas: HTMLCanvasElement, willRead: boolean) {
  const context = canvas.getContext("2d", willRead ? { willReadFrequently: true } : undefined);
  if (!context) throw new Error("브라우저에서 이미지를 만들 수 없습니다.");
  return context;
}

export function trimCanvas(source: HTMLCanvasElement, padding: number) {
  const context = requireContext(source, true);
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const output = document.createElement("canvas");
  output.width = cropWidth + padding * 2;
  output.height = cropHeight + padding * 2;
  const outputContext = requireContext(output, false);
  outputContext.drawImage(source, minX, minY, cropWidth, cropHeight, padding, padding, cropWidth, cropHeight);
  return output;
}

function drawFlourish(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
  size: number
) {
  context.save();
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, size * 0.035);
  context.beginPath();
  context.moveTo(x + width * 0.04, y);
  context.bezierCurveTo(
    x + width * 0.28,
    y + size * 0.2,
    x + width * 0.62,
    y - size * 0.14,
    x + width * 0.98,
    y + size * 0.02
  );
  context.stroke();
  context.lineWidth = Math.max(2, size * 0.02);
  context.beginPath();
  context.moveTo(x + width * 0.74, y - size * 0.02);
  context.quadraticCurveTo(x + width * 1.06, y - size * 0.24, x + width * 0.9, y + size * 0.18);
  context.stroke();
  context.restore();
}

export function renderSignature(options: {
  text: string;
  fontFamily: string;
  fallbackFamily: string;
  color: string;
  slant: number;
  flourish: boolean;
}): Raster {
  const text = options.text.normalize("NFC").trim();
  if (!text) throw new Error("이름을 입력해주세요.");

  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 720;
  const context = requireContext(canvas, true);
  const maxWidth = 1500;
  let size = 280;
  context.font = fontCss(size, options.fontFamily, options.fallbackFamily);
  const measured = context.measureText(text).width;
  if (measured > maxWidth && measured > 0) size = Math.max(64, size * (maxWidth / measured));

  context.font = fontCss(size, options.fontFamily, options.fallbackFamily);
  const textWidth = context.measureText(text).width;
  const metrics = context.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || size * 0.82;
  const descent = metrics.actualBoundingBoxDescent || size * 0.2;

  context.save();
  context.translate(150, 90);
  context.transform(1, 0, options.slant, 1, 0, 0);
  context.font = fontCss(size, options.fontFamily, options.fallbackFamily);
  context.fillStyle = options.color;
  context.textBaseline = "alphabetic";
  const baseline = ascent + 8;
  context.fillText(text, 0, baseline);
  if (options.flourish) {
    drawFlourish(context, 0, baseline + Math.max(8, descent * 0.45), textWidth, options.color, size);
  }
  context.restore();

  const trimmed = trimCanvas(canvas, 28);
  if (!trimmed) throw new Error("서명을 만들지 못했습니다.");
  return canvasToRaster(trimmed);
}

function traceRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function traceStamp(
  context: CanvasRenderingContext2D,
  shape: StampShape,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  radius: number
) {
  context.beginPath();
  if (shape === "circle" || shape === "ellipse") {
    context.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    return;
  }
  if (shape === "square") {
    context.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    return;
  }
  traceRoundRect(context, cx - rx, cy - ry, rx * 2, ry * 2, radius);
}

function hash01(x: number, y: number) {
  let hash = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function applyInkTexture(context: CanvasRenderingContext2D, amount: number) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const alphaAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return data[(y * width + x) * 4 + 3] ?? 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 0;
      if (alpha < 8) continue;
      const edge =
        alphaAt(x - 2, y) < 24 ||
        alphaAt(x + 2, y) < 24 ||
        alphaAt(x, y - 2) < 24 ||
        alphaAt(x, y + 2) < 24;
      const noise = hash01(x, y);
      if (edge && noise < amount * 0.8) data[index + 3] = 0;
      else if (!edge && noise > 1 - amount * 0.045) data[index + 3] = Math.round(alpha * 0.4);
    }
  }

  context.putImageData(image, 0, 0);
}

export function renderStamp(options: {
  text: string;
  fontFamily: string;
  fallbackFamily: string;
  color: string;
  shape: StampShape;
  layout: SealLayout;
  relief: StampRelief;
  doubleBorder: boolean;
  texture: boolean;
  appendIn: boolean;
  aspect: number;
}): Raster {
  const text = options.text.normalize("NFC").trim();
  if (!text) throw new Error("이름을 입력해주세요.");

  const longEdge = 760;
  const aspect = options.aspect > 0 ? options.aspect : 1;
  const width = aspect >= 1 ? longEdge : Math.max(1, Math.round(longEdge * aspect));
  const height = aspect >= 1 ? Math.max(1, Math.round(longEdge / aspect)) : longEdge;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = requireContext(canvas, true);

  const stroke = Math.min(width, height) * (options.doubleBorder ? 0.04 : 0.05);
  const margin = stroke + 12;
  const cx = width / 2;
  const cy = height / 2;
  const outerRx = width / 2 - margin;
  const outerRy = height / 2 - margin;
  const gap = stroke * 1.2;
  const innerRx = outerRx - stroke - gap;
  const innerRy = outerRy - stroke - gap;
  const corner = Math.min(width, height) * 0.14;

  if (options.relief === "yin") {
    context.fillStyle = options.color;
    traceStamp(context, options.shape, cx, cy, outerRx, outerRy, corner);
    context.fill();
    if (options.doubleBorder) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = stroke * 0.72;
      traceStamp(context, options.shape, cx, cy, innerRx, innerRy, corner * 0.8);
      context.stroke();
    }
  } else {
    context.strokeStyle = options.color;
    context.lineWidth = stroke;
    traceStamp(context, options.shape, cx, cy, outerRx - stroke / 2, outerRy - stroke / 2, corner);
    context.stroke();
    if (options.doubleBorder) {
      context.lineWidth = stroke * 0.7;
      traceStamp(context, options.shape, cx, cy, innerRx, innerRy, corner * 0.8);
      context.stroke();
    }
  }

  let contentRx = (options.doubleBorder ? innerRx : outerRx) - stroke;
  let contentRy = (options.doubleBorder ? innerRy : outerRy) - stroke;
  if (options.shape === "circle" || options.shape === "ellipse") {
    contentRx *= 0.7;
    contentRy *= 0.7;
  }

  const box = {
    x: cx - contentRx,
    y: cy - contentRy,
    w: contentRx * 2,
    h: contentRy * 2
  };
  const glyphs = layoutSealGlyphs(text, options.layout, options.appendIn);
  context.fillStyle = options.relief === "yin" ? "#ffffff" : options.color;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const glyph of glyphs) {
    const cellWidth = Math.max(8, box.w * glyph.slotW * 0.88);
    const cellHeight = Math.max(8, box.h * glyph.slotH * 0.88);
    let fontSize = Math.min(cellWidth, cellHeight);
    context.font = fontCss(fontSize, options.fontFamily, options.fallbackFamily);
    const glyphWidth = context.measureText(glyph.char).width;
    if (glyphWidth > cellWidth && glyphWidth > 0) fontSize *= cellWidth / glyphWidth;
    context.font = fontCss(fontSize, options.fontFamily, options.fallbackFamily);
    context.fillText(glyph.char, box.x + glyph.x * box.w, box.y + glyph.y * box.h);
  }

  if (options.texture) applyInkTexture(context, 0.42);
  return canvasToRaster(canvas);
}

export function rasterFromCanvas(source: HTMLCanvasElement, padding = 20): Raster | null {
  const trimmed = trimCanvas(source, padding);
  if (!trimmed) return null;
  return canvasToRaster(trimmed);
}
