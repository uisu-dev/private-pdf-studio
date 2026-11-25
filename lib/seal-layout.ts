export type SealCell = {
  char: string;
  /** 0 is the left column. */
  col: number;
  /** 0 is the top row. */
  row: number;
  colSpan: number;
  rowSpan: number;
};

export type SealLayout = {
  columns: number;
  rows: number;
  cells: SealCell[];
};

/** Strip whitespace and return Unicode characters, so a Hangul syllable counts as one. */
export function sealGraphemes(name: string) {
  return Array.from(name.replace(/\s+/g, ""));
}

/**
 * Lay out a Korean name the way a personal seal (인감) does.
 * Columns are read right to left and top to bottom.
 * A 3-character name keeps the surname large on the right.
 * With `suffixIn`, that name becomes a 2×2 seal and 인 sits under the surname.
 */
export function layoutSeal(name: string, suffixIn: boolean): SealLayout {
  const chars = sealGraphemes(name);
  if (chars.length < 2 || chars.length > 4) {
    throw new Error("도장은 2자에서 4자까지 만들 수 있습니다.");
  }
  if (suffixIn && chars.length !== 3) {
    throw new Error("'인'은 세 글자 이름에만 붙일 수 있습니다.");
  }

  if (chars.length === 2) {
    return {
      columns: 1,
      rows: 2,
      cells: [
        { char: chars[0], col: 0, row: 0, colSpan: 1, rowSpan: 1 },
        { char: chars[1], col: 0, row: 1, colSpan: 1, rowSpan: 1 }
      ]
    };
  }

  if (chars.length === 3 && !suffixIn) {
    return {
      columns: 2,
      rows: 2,
      cells: [
        { char: chars[0], col: 1, row: 0, colSpan: 1, rowSpan: 2 },
        { char: chars[1], col: 0, row: 0, colSpan: 1, rowSpan: 1 },
        { char: chars[2], col: 0, row: 1, colSpan: 1, rowSpan: 1 }
      ]
    };
  }

  const four = suffixIn ? [...chars, "인"] : chars;
  return {
    columns: 2,
    rows: 2,
    cells: suffixIn
      ? [
          { char: four[0], col: 1, row: 0, colSpan: 1, rowSpan: 1 },
          { char: four[1], col: 0, row: 0, colSpan: 1, rowSpan: 1 },
          { char: four[2], col: 0, row: 1, colSpan: 1, rowSpan: 1 },
          { char: "인", col: 1, row: 1, colSpan: 1, rowSpan: 1 }
        ]
      : [
          { char: four[0], col: 1, row: 0, colSpan: 1, rowSpan: 1 },
          { char: four[1], col: 1, row: 1, colSpan: 1, rowSpan: 1 },
          { char: four[2], col: 0, row: 0, colSpan: 1, rowSpan: 1 },
          { char: four[3], col: 0, row: 1, colSpan: 1, rowSpan: 1 }
        ]
  };
}
