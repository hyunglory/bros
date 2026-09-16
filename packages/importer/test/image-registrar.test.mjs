import assert from "node:assert/strict";
import test from "node:test";
import { createImageRegistrar, sourceImageOccurrences } from "../dist/index.js";

test("source image occurrences keep roles, option identity, URL and raw evidence", () => {
  const occurrences = sourceImageOccurrences({
    platformCode: "MUSINSA",
    externalProductId: "image-source",
    productName: "Fixture",
    images: [
      {
        imageType: "MAIN",
        sourceOrder: 0,
        sourceUrl: "https://cdn.example/main.jpg",
        raw: { column: "M" },
      },
      {
        imageType: "DETAIL",
        sourceOrder: 0,
        sourceUrl: "https://cdn.example/detail.jpg",
        raw: { column: "N" },
      },
    ],
    options: [
      {
        rawOptionName: " Black / 270 ".trim(),
        sourceOrder: 0,
        imageUrl: "https://cdn.example/black.jpg",
        raw: { column: "K" },
      },
      { rawOptionName: "No image", sourceOrder: 1, raw: {} },
    ],
    raw: {},
  });
  assert.deepEqual(
    occurrences.map((image) => [image.occurrenceKey, image.imageType, image.sourceUrl]),
    [
      ["option:v1:black / 270:0", "SOURCE_DETAIL", "https://cdn.example/black.jpg"],
      ["product:DETAIL:0", "SOURCE_DETAIL", "https://cdn.example/detail.jpg"],
      ["product:MAIN:0", "SOURCE_MAIN", "https://cdn.example/main.jpg"],
    ],
  );
  assert.deepEqual(occurrences[0].raw, { column: "K" });
});

test("invalid registrar budgets and public IDs fail before DB access", async () => {
  for (const options of [{ lockTimeoutMs: 0 }, { maxAttempts: 0 }, { maxAttempts: 6 }]) {
    assert.throws(() => createImageRegistrar({ db: null }, options), {
      code: "INVALID_IMAGE_REGISTRAR_OPTIONS",
    });
  }
  await assert.rejects(createImageRegistrar({ db: null }).process("internal-id"), {
    code: "INVALID_IMPORT_ITEM_ID",
  });
});
