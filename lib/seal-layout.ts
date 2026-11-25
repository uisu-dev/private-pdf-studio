export type SealLayout = "vertical" | "horizontal" | "grid";

export type SealGlyph = {
  char: string;
  /** Center from the left of the content box, 0–1. */
  x: number;
  /** Center from the top of the content box, 0–1. */
  y: number;
  slotW: number;
  slotH: number;
};

/** Graphemes with whitespace removed. Three-character names can gain a trailing 인. */
export function sealCharacters(name: string, appendIn: boolean) {
  const chars = Array.from(name.normalize("NFC").replace(/\s+/g, ""));
  if (appendIn && chars.length === 3) return [...chars, "인"];
  return chars;
}

export function layoutSealGlyphs(name: string, layout: SealLayout, appendIn: boolean): SealGlyph[] {
  const chars = sealCharacters(name, appendIn);
  if (chars.length === 0) return [];
  if (layout === "horizontal") return row(chars);
  if (layout === "vertical") return column(chars);
  return grid(chars);
}

function column(chars: string[]): SealGlyph[] {
  const slotH = 1 / chars.length;
  return chars.map((char, index) => ({
    char,
    x: 0.5,
    y: slotH * (index + 0.5),
    slotW: 1,
    slotH
  }));
}

function row(chars: string[]): SealGlyph[] {
  const slotW = 1 / chars.length;
  return chars.map((char, index) => ({
    char,
    x: slotW * (index + 0.5),
    y: 0.5,
    slotW,
    slotH: 1
  }));
}

/**
 * Name-seal order: top-to-bottom, right column first, then the left column.
 * 홍길동인 is therefore
 *   동 홍
 *   인 길
 */
function grid(chars: string[]): SealGlyph[] {
  if (chars.length === 1) {
    return [{ char: chars[0] ?? "", x: 0.5, y: 0.5, slotW: 0.78, slotH: 0.78 }];
  }
  if (chars.length === 2) return column(chars);
  if (chars.length === 3) {
    return [
      { char: chars[0] ?? "", x: 0.75, y: 0.25, slotW: 0.5, slotH: 0.5 },
      { char: chars[1] ?? "", x: 0.75, y: 0.75, slotW: 0.5, slotH: 0.5 },
      { char: chars[2] ?? "", x: 0.25, y: 0.5, slotW: 0.5, slotH: 0.5 }
    ];
  }

  const rows = Math.ceil(chars.length / 2);
  const rightCount = Math.ceil(chars.length / 2);
  const slotW = 0.5;
  const slotH = 1 / rows;
  return chars.map((char, index) => {
    const onLeft = index >= rightCount;
    const rowIndex = onLeft ? index - rightCount : index;
    return {
      char,
      x: slotW * ((onLeft ? 0 : 1) + 0.5),
      y: slotH * (rowIndex + 0.5),
      slotW,
      slotH
    };
  });
}
