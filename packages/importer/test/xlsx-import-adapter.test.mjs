import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "@e965/xlsx";

import { XlsxImportError, createXlsxImportAdapter, maximumXlsxBytes } from "../dist/index.js";

const headers = [
  "고유값",
  "원본사이트",
  "원본상품코드",
  "상품명",
  "브랜드",
  "카테고리코드",
  "재고수",
  "상태",
  "옵션수",
  "옵션명 목록",
  "옵션 이미지 URL 목록",
  "간략설명",
  "대표이미지 URL",
  "원문상품 URL(추정)",
  "원산지",
  "제조사",
  "내부 상품코드",
  "원가(내보내기값)",
  "판매가(내보내기값)",
  "데이터상태",
  "누락·비정상 항목",
];

function sourceRow(overrides = {}) {
  const row = [
    "legacy-100",
    "OliveYoung.co.kr",
    "A000000110553",
    "테스트 블러셔",
    "테스트 브랜드",
    "101005002002000000",
    31,
    "재고",
    2,
    "코랄 | 로제",
    "https://image.oliveyoung.co.kr/coral.jpg | https://image.oliveyoung.co.kr/rose.jpg",
    "설명",
    "https://image.oliveyoung.co.kr/main.jpg",
    "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000110553",
    "대한민국",
    "제조사",
    "",
    0,
    0,
    "확인 완료",
    "",
  ];
  for (const [index, value] of Object.entries(overrides)) {
    row[Number(index)] = value;
  }
  return row;
}

function createWorkbook({ rows, sourceHeaders = headers, sheetName = "상품 목록" }) {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["더망고 export"],
    [],
    [],
    [],
    sourceHeaders,
    ...rows,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
}

function parse(workbook) {
  return createXlsxImportAdapter().parse({
    collectedAt: "2026-09-14T10:00:00+09:00",
    sourceFileName: "더망고_상품정보_20260913.xlsx",
    workbook,
  });
}

test("maps the first XLSX shape losslessly into SourceProductInput", async () => {
  const result = await parse(
    createWorkbook({
      rows: [
        sourceRow(),
        sourceRow({
          0: "legacy-101",
          1: "MUSINSA.com",
          2: "6210231",
          6: 0,
          8: 0,
          9: "",
          10: "",
          12: "https://image.musinsa.com/main.jpg",
          13: "https://www.musinsa.com/products/6210231",
        }),
      ],
    }),
  );

  assert.deepEqual(result.context, {
    collectedAt: "2026-09-14T10:00:00+09:00",
    sourceAsOfDate: "2026-09-13",
  });
  assert.deepEqual(result.summary, { mapped: 2, rejected: 0, total: 2 });

  const [oliveYoung, musinsa] = result.rows;
  assert.equal(oliveYoung?.outcome, "MAPPED");
  assert.equal(oliveYoung?.sourceLocator, "상품 목록!A6:U6");
  assert.deepEqual(
    oliveYoung?.input.options?.map((option) => [option.rawOptionName, option.imageUrl]),
    [
      ["코랄", "https://image.oliveyoung.co.kr/coral.jpg"],
      ["로제", "https://image.oliveyoung.co.kr/rose.jpg"],
    ],
  );
  assert.equal(oliveYoung?.input.stockStatus, "IN_STOCK");
  assert.equal(oliveYoung?.input.normalPrice, undefined);
  assert.equal(oliveYoung?.input.currentPrice, undefined);
  assert.equal(oliveYoung?.input.currencyCode, undefined);
  assert.equal(oliveYoung?.input.raw.cells["고유값"], "legacy-100");
  assert.equal(oliveYoung?.input.raw.cells["카테고리코드"], "101005002002000000");
  assert.equal(oliveYoung?.input.identifiers, undefined);
  assert.equal(musinsa?.outcome, "MAPPED");
  assert.equal(musinsa?.input.stockStatus, "OUT_OF_STOCK");
  assert.equal(musinsa?.input.options, undefined);
});

test("rejects missing external product IDs without falling back to the legacy export ID", async () => {
  const result = await parse(createWorkbook({ rows: [sourceRow({ 2: "" })] }));

  assert.deepEqual(result.summary, { mapped: 0, rejected: 1, total: 1 });
  assert.equal(result.rows[0]?.outcome, "REJECTED");
  assert.equal(result.rows[0]?.input, undefined);
  assert.deepEqual(result.rows[0]?.issues, [
    { code: "MISSING_EXTERNAL_PRODUCT_ID", path: "/원본상품코드" },
  ]);
});

test("reproduces the 20-row representative mapping aggregate with a non-identifying fixture", async () => {
  const rows = Array.from({ length: 20 }, (_unused, index) =>
    sourceRow({
      0: `legacy-${index + 1}`,
      2: `A000000${String(index + 100_000).padStart(6, "0")}`,
      3: `대표 상품 ${index + 1}`,
      8: index === 6 || index === 7 ? 2 : 0,
      9: index === 6 || index === 7 ? "옵션 A | 옵션 B" : "",
      10:
        index === 6 || index === 7
          ? "https://image.oliveyoung.co.kr/a.jpg | https://image.oliveyoung.co.kr/b.jpg"
          : "",
    }),
  );
  for (const index of [10, 11, 16, 17]) {
    rows[index][2] = "";
  }

  const result = await parse(createWorkbook({ rows }));

  assert.deepEqual(result.summary, { mapped: 16, rejected: 4, total: 20 });
  assert.deepEqual(
    result.rows.filter((row) => row.outcome === "REJECTED").map((row) => row.sourceRowNumber),
    [16, 17, 22, 23],
  );
  assert.ok(
    result.rows
      .filter((row) => row.outcome === "REJECTED")
      .every((row) => row.issues.some((item) => item.code === "MISSING_EXTERNAL_PRODUCT_ID")),
  );
});

test("rejects loss-prone option, URL, price, and formula mappings by safe issue code", async () => {
  const workbook = XLSX.read(
    createWorkbook({
      rows: [
        sourceRow({
          9: "코랄 | 로제",
          10: "https://image.oliveyoung.co.kr/coral.jpg",
          13: "https://example.com/not-olive-young",
          17: "not-a-price",
        }),
      ],
    }),
    { type: "array" },
  );
  const worksheet = workbook.Sheets["상품 목록"];
  worksheet.D6 = { f: "1+1", t: "n", v: 2 };
  const result = await parse(
    new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })),
  );

  assert.equal(result.rows[0]?.outcome, "REJECTED");
  assert.deepEqual(
    result.rows[0]?.issues.map((item) => item.code),
    [
      "UNSUPPORTED_CELL_VALUE",
      "MISSING_PRODUCT_NAME",
      "OPTION_IMAGE_COUNT_MISMATCH",
      "INVALID_PRODUCT_URL",
      "INVALID_EXPORT_PRICE",
    ],
  );
});

test("rejects an unexpected source sheet/header and oversized input before row mapping", async () => {
  const adapter = createXlsxImportAdapter();
  await assert.rejects(
    adapter.parse({
      collectedAt: "2026-09-14T10:00:00Z",
      workbook: createWorkbook({ sheetName: "다른 시트", rows: [sourceRow()] }),
    }),
    (error) => error instanceof XlsxImportError && error.code === "SOURCE_SHEET_NOT_FOUND",
  );
  await assert.rejects(
    parse(createWorkbook({ sourceHeaders: headers.slice(1), rows: [sourceRow()] })),
    (error) => error instanceof XlsxImportError && error.code === "INVALID_SOURCE_HEADER",
  );
  await assert.rejects(
    adapter.parse({
      collectedAt: "2026-09-14T10:00:00Z",
      workbook: new Uint8Array(maximumXlsxBytes + 1),
    }),
    (error) => error instanceof XlsxImportError && error.code === "WORKBOOK_TOO_LARGE",
  );
});
