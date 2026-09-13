import assert from "node:assert/strict";
import test from "node:test";

import { Value } from "@sinclair/typebox/value";

import {
  DecimalStringSchema,
  SourceProductInputSchema,
  validateSourceImportContext,
  validateSourceProductInput,
} from "../dist/source-product.js";

function issueCodes(result) {
  assert.equal(result.ok, false);
  return result.issues.map((issue) => issue.code);
}

test("accepts a full adapter-neutral source product", () => {
  const input = {
    platformCode: "OLIVEYOUNG",
    externalProductId: "A000000110553",
    productName: "바이로댕 블러셔 4 Colors",
    brandName: "투쿨포스쿨",
    productUrl: "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000110553",
    normalPrice: "20000.0000",
    currentPrice: "18000",
    currencyCode: "KRW",
    stockStatus: "IN_STOCK",
    identifiers: [{ type: "PRODUCT_NO", value: "A000000110553" }],
    options: [
      {
        rawOptionName: "드 코랄",
        sourceOrder: 0,
        externalSkuId: "sku-coral",
        currentPrice: "18000",
        stockStatus: "UNKNOWN",
        imageUrl: "https://image.oliveyoung.co.kr/item/coral.png?QT=85",
        raw: { optionName: "드 코랄" },
      },
      {
        rawOptionName: "드 로제",
        sourceOrder: 1,
        externalSkuId: "sku-rose",
        raw: { optionName: "드 로제" },
      },
    ],
    images: [
      {
        imageType: "MAIN",
        sourceOrder: 0,
        sourceUrl: "https://image.oliveyoung.co.kr/main.jpg?QT=85&SF=jpg",
        raw: { column: "대표이미지 URL" },
      },
      {
        imageType: "DETAIL",
        sourceOrder: 0,
        sourceUrl: "https://image.oliveyoung.co.kr/detail.jpg",
        raw: { column: "상세이미지 URL" },
      },
    ],
    raw: { legacyId: "360669", categoryCode: "101005002002000000" },
  };

  assert.equal(Value.Check(SourceProductInputSchema, input), true);
  assert.deepEqual(validateSourceProductInput(input), { ok: true, value: input });
});

test("accepts a partial product when optional business fields are absent", () => {
  const input = {
    platformCode: "MUSINSA",
    externalProductId: "6210231",
    productName: "페탈린 오드퍼퓸 50ML",
    raw: {},
  };

  assert.deepEqual(validateSourceProductInput(input), { ok: true, value: input });
});

test("rejects invalid required fields and unknown top-level properties", () => {
  for (const input of [
    { externalProductId: "1", productName: "name", raw: {} },
    { platformCode: "MUSINSA", externalProductId: " ", productName: "name", raw: {} },
    { platformCode: "MUSINSA", externalProductId: "1", productName: " name", raw: {} },
    {
      platformCode: "MUSINSA",
      externalProductId: "1",
      productName: "name",
      unexpected: true,
      raw: {},
    },
  ]) {
    const codes = issueCodes(validateSourceProductInput(input));
    assert.ok(codes.length > 0);
    assert.ok(codes.every((code) => code === "INVALID_STRUCTURE"));
  }
});

test("rejects malformed and credential-bearing URLs without throwing or exposing values", () => {
  const secretValue = "must-not-appear";
  const result = validateSourceProductInput({
    platformCode: "MUSINSA",
    externalProductId: "6210231",
    productName: "product",
    productUrl: "https://%",
    options: [
      {
        rawOptionName: "one",
        sourceOrder: 0,
        imageUrl: `https://example.com/option.jpg?X-Amz-Credential=${secretValue}`,
        raw: {},
      },
    ],
    images: [
      {
        imageType: "MAIN",
        sourceOrder: 0,
        sourceUrl: `https://user:${secretValue}@example.com/main.jpg`,
        raw: {},
      },
    ],
    raw: {},
  });

  assert.deepEqual(issueCodes(result), [
    "INVALID_URL",
    "SENSITIVE_URL_QUERY",
    "URL_CREDENTIALS_NOT_ALLOWED",
  ]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secretValue));
});

test("uses decimal strings compatible with numeric(20,4) and requires currency", () => {
  assert.equal(Value.Check(DecimalStringSchema, "9999999999999999.9999"), true);
  for (const invalid of ["10000000000000000", "01", "-1", "1.00000", 1000]) {
    assert.equal(Value.Check(DecimalStringSchema, invalid), false);
  }

  const missingCurrency = validateSourceProductInput({
    platformCode: "MUSINSA",
    externalProductId: "6210231",
    productName: "product",
    currentPrice: "1000",
    raw: {},
  });
  assert.deepEqual(issueCodes(missingCurrency), ["PRICE_REQUIRES_CURRENCY"]);
});

test("rejects duplicate option, image, identifier, and main image identities", () => {
  const result = validateSourceProductInput({
    platformCode: "MUSINSA",
    externalProductId: "6210231",
    productName: "product",
    identifiers: [
      { type: "STYLE_CODE", value: "abc" },
      { type: "STYLE_CODE", value: "ABC" },
    ],
    options: [
      { rawOptionName: "black", sourceOrder: 0, externalSkuId: "sku-1", raw: {} },
      { rawOptionName: "white", sourceOrder: 0, externalSkuId: "sku-1", raw: {} },
    ],
    images: [
      { imageType: "MAIN", sourceOrder: 0, sourceUrl: "https://example.com/1.jpg", raw: {} },
      { imageType: "MAIN", sourceOrder: 0, sourceUrl: "https://example.com/2.jpg", raw: {} },
    ],
    raw: {},
  });

  assert.deepEqual(issueCodes(result), [
    "DUPLICATE_OPTION_SOURCE_ORDER",
    "DUPLICATE_EXTERNAL_SKU_ID",
    "DUPLICATE_IMAGE_POSITION",
    "DUPLICATE_IDENTIFIER",
    "MULTIPLE_MAIN_IMAGES",
  ]);
});

test("rejects non-JSON raw values and secret-bearing inputs without exposing values", () => {
  const circular = {};
  circular.self = circular;
  const secretValue = "must-not-appear";
  const result = validateSourceProductInput({
    platformCode: "MUSINSA",
    externalProductId: "6210231",
    productName: "product",
    productUrl: `https://example.com/product?token=${secretValue}`,
    options: [{ rawOptionName: "one", sourceOrder: 0, raw: { accessToken: secretValue } }],
    raw: circular,
  });

  assert.deepEqual(issueCodes(result), [
    "SENSITIVE_URL_QUERY",
    "SENSITIVE_FIELD",
    "INVALID_RAW_JSON",
  ]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secretValue));
});

test("validates import timestamps separately from source product fields", () => {
  assert.deepEqual(
    validateSourceImportContext({
      collectedAt: "2026-09-14T09:30:00+09:00",
      sourceAsOfDate: "2026-09-13",
    }),
    {
      ok: true,
      value: {
        collectedAt: "2026-09-14T09:30:00+09:00",
        sourceAsOfDate: "2026-09-13",
      },
    },
  );

  assert.deepEqual(
    issueCodes(validateSourceImportContext({ collectedAt: "2026-02-30T00:00:00Z" })),
    ["INVALID_TIMESTAMP"],
  );
  assert.deepEqual(
    issueCodes(validateSourceImportContext({ collectedAt: "2026-09-14T00:00:00+14:01" })),
    ["INVALID_TIMESTAMP"],
  );
  assert.deepEqual(
    issueCodes(
      validateSourceImportContext({
        collectedAt: "2026-09-14T00:00:00Z",
        sourceAsOfDate: "2026-02-30",
      }),
    ),
    ["INVALID_SOURCE_DATE"],
  );
});
