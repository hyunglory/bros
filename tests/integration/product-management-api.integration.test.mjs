import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../../apps/api/dist/index.js";
import { createRedactedLogger, loadConfig } from "../../packages/core/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

function quietLogger() {
  return createRedactedLogger({
    write() {
      return true;
    },
  });
}

function fakeQueue() {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    publish: async () => ({ provider: "fake", providerId: "unused" }),
    work: () => Promise.resolve(),
  };
}

test(
  "P2-15 MASTER API paginates, filters, traces public relations, and rejects stale edits",
  { timeout: 30000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    await migrateToLatest(fixture.db);
    const runtime = createApiApp(
      loadConfig({ DATABASE_URL: fixture.connectionString, API_LOCAL_UNAUTHENTICATED: "true" }),
      quietLogger(),
      { queue: fakeQueue() },
    );
    t.after(async () => {
      await runtime.close();
      await fixture.cleanup();
    });
    await runtime.start();

    const brand = (
      await fixture.client.query(
        `INSERT INTO app.brand(brand_key,name_ko,name_en,metadata_json)
         VALUES('NIKE','나이키','Nike',$1) RETURNING id,public_id`,
        [{ privateBrandNote: "must-not-leak" }],
      )
    ).rows[0];
    const platform = (
      await fixture.client.query("SELECT id,public_id FROM app.platform WHERE code='MUSINSA'")
    ).rows[0];
    const missing = (
      await fixture.client.query(
        `INSERT INTO app.product_master(product_name,product_name_norm,created_method,created_at,metadata_json)
         VALUES('관계 없는 상품','관계 없는 상품','MANUAL','2026-09-14T01:00:00.000500Z',$1)
         RETURNING id,public_id`,
        [{ privateMasterNote: "must-not-leak" }],
      )
    ).rows[0];
    const master = (
      await fixture.client.query(
        `INSERT INTO app.product_master(brand_id,product_name,product_name_norm,status,identifier_status,created_method,created_at,metadata_json)
         VALUES($1,'Air Max 90','air max 90','REVIEW_REQUIRED','CANDIDATE','IMPORT_STRONG_IDENTIFIER','2026-09-14T01:00:00.000900Z',$2)
         RETURNING id,public_id`,
        [brand.id, { privateMasterNote: "must-not-leak" }],
      )
    ).rows[0];
    const sku = (
      await fixture.client.query(
        `INSERT INTO app.product_sku(product_id,sku_name,option_key,option_json,sort_order)
         VALUES($1,'Air Max 90 / 270','size=270',$2,0) RETURNING id,public_id`,
        [master.id, { size: "270" }],
      )
    ).rows[0];
    const identifier = (
      await fixture.client.query(
        `INSERT INTO app.product_identifier(product_id,sku_id,identifier_type,identifier_value,identifier_norm,is_primary,is_verified,confidence_score,evidence_type,evidence_json)
         VALUES($1,$2,'STYLE_CODE','HF3835-100','HF3835-100',true,false,91.25,'SOURCE_EMBEDDED',$3)
         RETURNING public_id`,
        [master.id, sku.id, { privateEvidence: "must-not-leak" }],
      )
    ).rows[0];
    const source = (
      await fixture.client.query(
        `INSERT INTO app.source_product(platform_id,external_product_id,product_id,product_url,raw_product_name,raw_brand_name,current_price,normal_price,currency_code,stock_status,match_status,match_confidence,raw_json,collected_at,last_seen_at)
         VALUES($1,'EXT-001',$2,'https://example.test/products/1','나이키 에어맥스','NIKE',129000,149000,'KRW','IN_STOCK','MATCHED',91.25,$3,'2026-09-14T00:00:00Z','2026-09-14T00:05:00Z')
         RETURNING id,public_id`,
        [platform.id, master.id, { rawSecret: "must-not-leak" }],
      )
    ).rows[0];
    const sourceSku = (
      await fixture.client.query(
        `INSERT INTO app.source_sku(source_product_id,sku_id,external_sku_id,raw_option_name,option_key,current_price,stock_status,option_json,raw_json)
         VALUES($1,$2,'EXT-SKU-270','270','size=270',129000,'IN_STOCK',$3,$4)
         RETURNING public_id`,
        [source.id, sku.id, { size: "270" }, { rawSecret: "must-not-leak" }],
      )
    ).rows[0];
    const image = (
      await fixture.client.query(
        `INSERT INTO app.product_image(product_id,sku_id,source_product_id,image_type,source_url,metadata_json)
         VALUES($1,$2,$3,'SOURCE_MAIN','https://example.test/image.jpg',$4) RETURNING public_id`,
        [master.id, sku.id, source.id, { privateImageNote: "must-not-leak" }],
      )
    ).rows[0];

    const first = await runtime.app.inject("/api/v1/products?limit=1");
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().items[0].publicId, master.public_id);
    assert.ok(first.json().nextCursor);
    const second = await runtime.app.inject(
      `/api/v1/products?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
    );
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().items[0].publicId, missing.public_id);
    assert.equal(second.json().nextCursor, null);
    assert.equal((await runtime.app.inject("/api/v1/products?cursor=broken")).statusCode, 400);

    for (const query of [
      "query=HF3835-100",
      "brand=나이키",
      "source=MUSINSA",
      "status=REVIEW_REQUIRED",
      "identifierStatus=CANDIDATE",
    ]) {
      const response = await runtime.app.inject(`/api/v1/products?${query}`);
      assert.equal(response.statusCode, 200, query);
      assert.ok(
        response.json().items.some((item) => item.publicId === master.public_id),
        query,
      );
    }

    const detail = await runtime.app.inject(`/api/v1/products/${master.public_id}`);
    assert.equal(detail.statusCode, 200);
    const body = detail.json();
    assert.equal(body.master.brand.publicId, brand.public_id);
    assert.equal(body.master.counts.sources, 1);
    assert.equal(body.master.counts.skus, 1);
    assert.equal(body.master.counts.identifiers, 1);
    assert.equal(body.master.counts.sourceImages, 1);
    assert.equal(body.skus[0].publicId, sku.public_id);
    assert.equal(body.identifiers[0].publicId, identifier.public_id);
    assert.equal(body.identifiers[0].skuPublicId, sku.public_id);
    assert.equal(body.sources[0].publicId, source.public_id);
    assert.equal(body.sources[0].platform.publicId, platform.public_id);
    assert.equal(body.sources[0].skus[0].publicId, sourceSku.public_id);
    assert.equal(body.sources[0].skus[0].canonicalSkuPublicId, sku.public_id);
    assert.equal(body.sourceImages[0].publicId, image.public_id);
    assert.equal(body.sourceImages[0].sourceProductPublicId, source.public_id);
    assert.equal(body.sourceImages[0].skuPublicId, sku.public_id);
    assert.doesNotMatch(
      detail.body,
      /must-not-leak|rawSecret|privateEvidence|object_key|storage_bucket/,
    );

    const noRelations = await runtime.app.inject(`/api/v1/products/${missing.public_id}`);
    assert.equal(noRelations.statusCode, 200);
    assert.equal(noRelations.json().master.brand, null);
    assert.deepEqual(noRelations.json().skus, []);
    assert.deepEqual(noRelations.json().identifiers, []);
    assert.deepEqual(noRelations.json().sources, []);
    assert.deepEqual(noRelations.json().sourceImages, []);
    assert.equal(
      (await runtime.app.inject("/api/v1/products/01890f47-0c4d-6abc-8def-1234567890ab"))
        .statusCode,
      400,
    );

    const withoutHeader = await runtime.app.inject({
      method: "PATCH",
      url: `/api/v1/products/${master.public_id}`,
      headers: { "content-type": "application/json" },
      payload: { expectedVersion: 1, changeReason: "검수 완료", status: "ACTIVE" },
    });
    assert.equal(withoutHeader.statusCode, 403);
    const withoutChange = await runtime.app.inject({
      method: "PATCH",
      url: `/api/v1/products/${master.public_id}`,
      headers: { "content-type": "application/json", "x-bros-operation": "product-update" },
      payload: { expectedVersion: 1, changeReason: "검수 완료" },
    });
    assert.equal(withoutChange.statusCode, 400);

    const requests = ["Air Max 90 White", "Air Max 90 Sail"].map((productName) =>
      runtime.app.inject({
        method: "PATCH",
        url: `/api/v1/products/${master.public_id}`,
        headers: { "content-type": "application/json", "x-bros-operation": "product-update" },
        payload: {
          expectedVersion: 1,
          changeReason: "동시 편집 검증",
          productName,
          categoryKey: "SHOES",
          productType: "SNEAKERS",
          status: "ACTIVE",
        },
      }),
    );
    const concurrent = await Promise.all(requests);
    assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [200, 409]);
    const conflict = concurrent.find((response) => response.statusCode === 409);
    assert.equal(conflict.json().error.code, "PRODUCT_VERSION_CONFLICT");
    assert.equal(conflict.json().error.details.expectedVersion, 1);
    assert.equal(conflict.json().error.details.actualVersion, 2);

    const stored = (
      await fixture.client.query(
        "SELECT product_name,product_name_norm,category_key,product_type,status,version_no,metadata_json FROM app.product_master WHERE id=$1",
        [master.id],
      )
    ).rows[0];
    assert.match(stored.product_name, /^Air Max 90 (White|Sail)$/);
    assert.equal(stored.product_name_norm, stored.product_name.toLowerCase());
    assert.equal(stored.category_key, "SHOES");
    assert.equal(stored.product_type, "SNEAKERS");
    assert.equal(stored.status, "ACTIVE");
    assert.equal(stored.version_no, 2);
    assert.equal(stored.metadata_json.privateMasterNote, "must-not-leak");
    assert.equal(stored.metadata_json.managementChanges.length, 1);
    assert.equal(stored.metadata_json.managementChanges[0].reason, "동시 편집 검증");
    assert.deepEqual(stored.metadata_json.managementChanges[0].changes.status, {
      from: "REVIEW_REQUIRED",
      to: "ACTIVE",
    });
  },
);

test("P2-15 MASTER API stays disabled without explicit loopback mode", async (t) => {
  const runtime = createApiApp(
    loadConfig({ DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused" }),
    quietLogger(),
  );
  t.after(() => runtime.close());
  const response = await runtime.app.inject("/api/v1/products");
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "BUSINESS_API_DISABLED");
});
