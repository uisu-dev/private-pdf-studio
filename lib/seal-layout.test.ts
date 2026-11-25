import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutSealGlyphs, sealCharacters } from "./seal-layout.ts";
import { markPngFilename, signedPdfFilename } from "./sign-names.ts";

test("three-character names can take a trailing 인", () => {
  assert.deepEqual(sealCharacters("홍길동", true), ["홍", "길", "동", "인"]);
  assert.deepEqual(sealCharacters("홍길동", false), ["홍", "길", "동"]);
  assert.deepEqual(sealCharacters(" 김 철 ", false), ["김", "철"]);
  assert.deepEqual(sealCharacters("남궁민수", true), ["남", "궁", "민", "수"]);
});

test("four-character seals read top-to-bottom, right column first", () => {
  const glyphs = layoutSealGlyphs("홍길동인", "grid", false);
  assert.deepEqual(
    glyphs.map((glyph) => [glyph.char, glyph.x, glyph.y]),
    [
      ["홍", 0.75, 0.25],
      ["길", 0.75, 0.75],
      ["동", 0.25, 0.25],
      ["인", 0.25, 0.75]
    ]
  );
});

test("a three-character grid keeps the third glyph centered on the left", () => {
  const glyphs = layoutSealGlyphs("홍길동", "grid", false);
  assert.deepEqual(
    glyphs.map((glyph) => glyph.char),
    ["홍", "길", "동"]
  );
  assert.equal(glyphs[2]?.x, 0.25);
  assert.equal(glyphs[2]?.y, 0.5);
});

test("vertical and horizontal layouts follow reading order", () => {
  const vertical = layoutSealGlyphs("김철", "vertical", false);
  assert.deepEqual(vertical.map((glyph) => [glyph.char, glyph.y]), [
    ["김", 0.25],
    ["철", 0.75]
  ]);
  const horizontal = layoutSealGlyphs("주식회사", "horizontal", false);
  assert.equal(horizontal[0]?.char, "주");
  assert.ok((horizontal[0]?.x ?? 1) < (horizontal[1]?.x ?? 0));
  assert.equal(horizontal.at(-1)?.char, "사");
});

test("signed PDF and PNG names", () => {
  assert.equal(signedPdfFilename("계약서.pdf"), "계약서_서명.pdf");
  assert.equal(signedPdfFilename("Notes.PDF"), "Notes_서명.pdf");
  assert.equal(signedPdfFilename("   "), "document_서명.pdf");
  assert.equal(markPngFilename("원형 세로"), "원형 세로.png");
  assert.equal(markPngFilename("a/b:c"), "a b c.png");
});
