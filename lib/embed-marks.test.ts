import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { embedSignatureImages } from "./embed-marks.ts";
import type { PageGeometry } from "./signature-geometry.ts";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);

test("embedding keeps the original document and draws at the converted origin", async () => {
  const source = await PDFDocument.create();
  source.setTitle("private-pdf-keep");
  source.addPage([612, 792]);
  const input = await source.save();
  const metrics: PageGeometry = { viewBox: [0, 0, 612, 792], rotation: 0, userUnit: 1 };

  const output = await embedSignatureImages(input, [metrics], [
    {
      pageIndex: 0,
      imageKey: "mark",
      pngBytes: png,
      nx: 0,
      ny: 0,
      nw: 100 / 612,
      rotation: 0,
      pixelWidth: 100,
      pixelHeight: 50
    }
  ]);

  const saved = await PDFDocument.load(output);
  assert.equal(saved.getTitle(), "private-pdf-keep");
  assert.equal(saved.getPageCount(), 1);
  const page = saved.getPage(0);
  assert.equal(page.getRotation().angle, 0);
  assert.deepEqual(page.getSize(), { width: 612, height: 792 });

  const resources = page.node.Resources();
  const xobjects = resources?.lookup(PDFName.of("XObject"));
  assert.ok(xobjects);

  const contents = page.node.Contents();
  assert.ok(contents instanceof PDFArray);
  const stream = contents.lookup(0);
  assert.ok(stream instanceof PDFRawStream);
  const text = new TextDecoder().decode(inflateSync(stream.getContents()));
  assert.match(text, /1 0 0 1 0 742 cm/);
  assert.match(text, /100 0 0 50 0 0 cm/);
});
