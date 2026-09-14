import assert from "node:assert/strict";
import test from "node:test";

import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "PostgreSQL rejects invalid relationships and preserves valid incomplete source data",
  { timeout: 120_000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    t.after(fixture.cleanup);
    const { client, db } = fixture;
    await migrateToLatest(db);

    async function insert(table, values) {
      assert.match(table, /^[a-z_]+$/);
      const columns = Object.keys(values);
      columns.forEach((column) => assert.match(column, /^[a-z_]+$/));
      const result = await client.query(
        `INSERT INTO app.${table} (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
        Object.values(values),
      );
      return result.rows[0];
    }
    async function rejects(promise, code) {
      await assert.rejects(promise, (error) => error.code === code);
    }
    const platform = (await client.query("SELECT id FROM app.platform WHERE code = 'MUSINSA'"))
      .rows[0];
    const brand = await insert("brand", { brand_key: "fixture", name_en: "Fixture" });
    const source = await insert("source_product", {
      platform_id: platform.id,
      external_product_id: "000000000000000000000123",
      raw_product_name: "Fixture",
      raw_json: "null",
      collected_at: new Date(),
      last_seen_at: new Date(),
    });

    await t.test(
      "public IDs are UUIDv7, unique, and internal identity cannot be supplied",
      async () => {
        assert.match(
          brand.public_id,
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        assert.equal(typeof brand.id, "string");
        await rejects(
          insert("brand", { id: 100, brand_key: "identity", name_en: "Fixture" }),
          "428C9",
        );
        await rejects(
          insert("brand", {
            public_id: brand.public_id,
            brand_key: "duplicate",
            name_en: "Fixture",
          }),
          "23505",
        );
        await rejects(
          insert("brand", { public_id: null, brand_key: "null-uuid", name_en: "Fixture" }),
          "23502",
        );
      },
    );

    await t.test(
      "brand name/key validation, alias scope uniqueness, and restrictive deletion",
      async () => {
        await rejects(insert("brand", { brand_key: "no-name" }), "23514");
        await rejects(insert("brand", { brand_key: " ", name_en: "Fixture" }), "23514");
        await insert("brand_alias", {
          brand_id: brand.id,
          alias_name: "Fixture",
          alias_norm: "fixture",
        });
        await rejects(
          insert("brand_alias", {
            brand_id: brand.id,
            alias_name: "Fixture",
            alias_norm: "fixture",
          }),
          "23505",
        );
        await insert("brand_alias", {
          brand_id: brand.id,
          platform_id: platform.id,
          alias_name: "Fixture",
          alias_norm: "fixture",
        });
        await rejects(client.query("DELETE FROM app.brand WHERE id = $1", [brand.id]), "23001");
        await rejects(
          insert("brand_alias", {
            brand_id: "9223372036854775807",
            alias_name: "Missing",
            alias_norm: "missing",
          }),
          "23503",
        );
      },
    );

    await t.test(
      "raw JSON preserves JSON null/scalars/arrays and external IDs keep leading zeros",
      async () => {
        assert.equal(source.external_product_id, "000000000000000000000123");
        assert.equal(source.raw_json, null);
        assert.equal(source.product_id, null);
        assert.equal(source.current_price, null);
        assert.equal(source.match_confidence, null);
        await rejects(
          insert("source_product", {
            platform_id: platform.id,
            external_product_id: source.external_product_id,
            raw_product_name: "Duplicate",
            raw_json: "{}",
            collected_at: new Date(),
            last_seen_at: new Date(),
          }),
          "23505",
        );
        for (const raw of ['[1,"two"]', '"value"', "42", "false"]) {
          await client.query("UPDATE app.source_product SET raw_json = $1 WHERE id = $2", [
            raw,
            source.id,
          ]);
          const result = await client.query(
            "SELECT raw_json FROM app.source_product WHERE id = $1",
            [source.id],
          );
          assert.deepEqual(result.rows[0].raw_json, JSON.parse(raw));
        }
        await rejects(
          client.query("UPDATE app.source_product SET raw_json = NULL WHERE id = $1", [source.id]),
          "23502",
        );
        await rejects(
          client.query("UPDATE app.brand SET metadata_json = '[]' WHERE id = $1", [brand.id]),
          "23514",
        );
      },
    );

    await t.test("prices, scores, currency, and states reject invalid values", async () => {
      for (const [column, value] of [
        ["current_price", "-1"],
        ["current_price", "NaN"],
        ["match_confidence", "100.01"],
        ["currency_code", "krw"],
        ["stock_status", "SOLD"],
        ["match_status", "UNKNOWN"],
      ]) {
        await rejects(
          client.query(`UPDATE app.source_product SET ${column} = $1 WHERE id = $2`, [
            value,
            source.id,
          ]),
          "23514",
        );
      }
      await client.query(
        "UPDATE app.source_product SET current_price = 0, match_confidence = 0, currency_code = 'KRW' WHERE id = $1",
        [source.id],
      );
    });

    await t.test("source SKU option and nullable external-ID uniqueness", async () => {
      const base = { source_product_id: source.id, raw_option_name: "Size", raw_json: "{}" };
      await insert("source_sku", { ...base, option_key: "a" });
      await insert("source_sku", { ...base, option_key: "b" });
      await rejects(insert("source_sku", { ...base, option_key: "a" }), "23505");
      await insert("source_sku", { ...base, option_key: "c", external_sku_id: "0001" });
      await rejects(
        insert("source_sku", { ...base, option_key: "d", external_sku_id: "0001" }),
        "23505",
      );
    });

    let original;
    await t.test(
      "image registration, atomic storage metadata, source revision, and output uniqueness",
      async () => {
        const base = {
          source_product_id: source.id,
          image_type: "SOURCE_MAIN",
          source_url: "https://example.invalid/fixture.jpg",
        };
        original = await insert("product_image", base);
        assert.equal(original.width, null);
        await rejects(insert("product_image", base), "23505");
        await insert("product_image", { ...base, source_revision: 2 });
        await rejects(insert("product_image", { image_type: "SOURCE_MAIN" }), "23514");
        await rejects(
          client.query("UPDATE app.product_image SET width = 10 WHERE id = $1", [original.id]),
          "23514",
        );
        await rejects(
          client.query("UPDATE app.product_image SET process_status = 'STORED' WHERE id = $1", [
            original.id,
          ]),
          "23514",
        );
        await rejects(insert("product_image", { ...base, source_revision: 0 }), "23514");
        const stored = {
          storage_provider: "LOCAL",
          storage_bucket: "fixture",
          object_key: "fixture.png",
          mime_type: "image/png",
          width: 1000,
          height: 1000,
          file_size: "100",
          content_hash: "a".repeat(64),
          process_status: "STORED",
        };
        await rejects(
          insert("product_image", { ...base, ...stored, source_revision: 3, content_hash: "bad" }),
          "23514",
        );
        const generated = {
          ...stored,
          source_product_id: source.id,
          image_type: "GENERATED_THUMBNAIL",
          source_image_id: original.id,
          recipe_hash: "b".repeat(64),
        };
        await rejects(insert("product_image", { ...generated, recipe_hash: null }), "23514");
        const races = await Promise.allSettled([
          insert("product_image", generated),
          insert("product_image", generated),
        ]);
        assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
        const rejected = races.find((r) => r.status === "rejected");
        assert.equal(rejected.reason.code, "23505");
      },
    );

    await t.test(
      "candidate uniqueness, score/rank/version bounds, and evidence array types",
      async () => {
        const run = await insert("identifier_resolve_run", {
          source_product_id: source.id,
          resolver_version: "fixture-v1",
        });
        const candidate = {
          resolve_run_id: run.id,
          identifier_type: "MODEL_NO",
          candidate_value: "ABC-1",
          candidate_norm: "ABC1",
          rank_no: 1,
        };
        await insert("identifier_candidate", candidate);
        await rejects(insert("identifier_candidate", candidate), "23505");
        for (const patch of [
          { rank_no: 0 },
          { version_no: 0 },
          { evidence_json: "{}" },
          { conflict_json: "{}" },
          { confidence_score: 101 },
          { identifier_type: "INVALID" },
        ]) {
          await rejects(
            insert("identifier_candidate", { ...candidate, candidate_norm: "new", ...patch }),
            "23514",
          );
        }
        await rejects(
          client.query(
            "UPDATE app.identifier_resolve_run SET started_at = '2026-01-02Z', finished_at = '2026-01-01Z' WHERE id = $1",
            [run.id],
          ),
          "23514",
        );
      },
    );

    await t.test(
      "MASTER/SKU scope and Identifier primary uniqueness preserve ownership",
      async () => {
        const base = {
          product_name: "Fixture",
          product_name_norm: "fixture",
          created_method: "IMPORT",
        };
        const master = await insert("product_master", base);
        const other = await insert("product_master", base);
        assert.equal(master.status, "REVIEW_REQUIRED");
        assert.equal(master.identifier_status, "UNKNOWN");
        assert.equal(master.product_type, "UNKNOWN");
        const sku = await insert("product_sku", {
          product_id: master.id,
          sku_name: "Size",
          option_key: "size=M",
        });
        await rejects(
          insert("product_sku", { product_id: master.id, sku_name: "Size", option_key: "size=M" }),
          "23505",
        );
        const identifier = {
          product_id: master.id,
          identifier_type: "MODEL_NO",
          identifier_value: "ABC",
          identifier_norm: "ABC",
          evidence_type: "SOURCE_FIELD",
        };
        await insert("product_identifier", identifier);
        await rejects(insert("product_identifier", identifier), "23505");
        // The same identifier on another MASTER is a resolver conflict, not a global UNIQUE violation.
        await insert("product_identifier", { ...identifier, product_id: other.id });
        await insert("product_identifier", { ...identifier, sku_id: sku.id, is_primary: true });
        await rejects(
          insert("product_identifier", { ...identifier, sku_id: sku.id, product_id: other.id }),
          "23503",
        );
        await rejects(
          insert("product_identifier", {
            ...identifier,
            sku_id: sku.id,
            identifier_norm: "OTHER",
            is_primary: true,
          }),
          "23505",
        );
        await insert("product_identifier", {
          ...identifier,
          identifier_norm: "PRIMARY",
          is_primary: true,
        });
        await rejects(
          insert("product_identifier", {
            ...identifier,
            identifier_norm: "PRIMARY2",
            is_primary: true,
          }),
          "23505",
        );
        await rejects(
          insert("product_image", {
            product_id: other.id,
            sku_id: sku.id,
            image_type: "SOURCE_MAIN",
          }),
          "23503",
        );
        await rejects(
          insert("product_image", {
            source_product_id: source.id,
            sku_id: sku.id,
            image_type: "SOURCE_MAIN",
          }),
          "23514",
        );
        await insert("product_image", {
          product_id: master.id,
          sku_id: sku.id,
          image_type: "SOURCE_MAIN",
        });
        await rejects(
          client.query("UPDATE app.product_sku SET product_id = $1 WHERE id = $2", [
            other.id,
            sku.id,
          ]),
          "23503",
        );
      },
    );

    await t.test("Import keeps every input row and rejects invalid final aggregates", async () => {
      const batch = await insert("import_batch", {
        platform_id: platform.id,
        import_type: "JSON",
        source_name: "fixture.json",
        total_count: 3,
      });
      await insert("import_item", {
        import_batch_id: batch.id,
        input_row_no: 1,
        raw_json: "null",
        status: "FAILED",
        action_type: "FAILED",
      });
      const item = {
        import_batch_id: batch.id,
        external_product_id: source.external_product_id,
        raw_json: "[]",
      };
      await insert("import_item", { ...item, input_row_no: 2 });
      await insert("import_item", { ...item, input_row_no: 3 });
      await rejects(insert("import_item", { ...item, input_row_no: 2 }), "23505");
      await rejects(insert("import_item", { ...item, input_row_no: 0 }), "23514");
      await rejects(
        client.query("UPDATE app.import_batch SET status = 'SUCCEEDED' WHERE id = $1", [batch.id]),
        "23514",
      );
      await client.query(
        "UPDATE app.import_batch SET status = 'PARTIAL_FAILED', failed_count = 1, success_count = 2 WHERE id = $1",
        [batch.id],
      );
      await rejects(
        client.query("UPDATE app.import_batch SET status = 'SUCCEEDED' WHERE id = $1", [batch.id]),
        "23514",
      );
      await rejects(
        client.query("UPDATE app.import_batch SET status = 'FAILED' WHERE id = $1", [batch.id]),
        "23514",
      );
      await client.query(
        "UPDATE app.import_batch SET status = 'FAILED', failed_count = 3, success_count = 0 WHERE id = $1",
        [batch.id],
      );
      await rejects(
        client.query("UPDATE app.import_batch SET status = 'PARTIAL_FAILED' WHERE id = $1", [
          batch.id,
        ]),
        "23514",
      );
      await rejects(
        client.query("UPDATE app.import_batch SET review_count = -1 WHERE id = $1", [batch.id]),
        "23514",
      );
    });

    await t.test(
      "Thumbnail success requires reproducibility fields and review versions are unique",
      async () => {
        const recipe = await insert("thumbnail_recipe", {
          recipe_code: "fixture",
          recipe_name: "Fixture",
        });
        assert.equal(recipe.output_width, 1000);
        await rejects(
          insert("thumbnail_recipe", { recipe_code: "fixture", recipe_name: "Fixture" }),
          "23505",
        );
        await insert("thumbnail_recipe", {
          recipe_code: "fixture",
          recipe_name: "Fixture",
          version_no: 2,
        });
        await rejects(
          insert("thumbnail_recipe", {
            recipe_code: "bad",
            recipe_name: "Fixture",
            output_height: 0,
          }),
          "23514",
        );
        const job = await insert("thumbnail_job", {
          product_image_id: original.id,
          recipe_id: recipe.id,
          request_key: "thumbnail-1",
        });
        await rejects(
          insert("thumbnail_job", {
            product_image_id: original.id,
            recipe_id: recipe.id,
            request_key: "thumbnail-1",
          }),
          "23505",
        );
        await rejects(
          client.query("UPDATE app.thumbnail_job SET status = 'SUCCEEDED' WHERE id = $1", [job.id]),
          "23514",
        );
        await rejects(
          client.query(
            "UPDATE app.thumbnail_job SET status = 'SUCCEEDED', recipe_hash = $1 WHERE id = $2",
            ["c".repeat(64), job.id],
          ),
          "23514",
        );
        await client.query(
          "UPDATE app.thumbnail_job SET status = 'SUCCEEDED', recipe_hash = $1, processing_version = 'fixture-v1', provider_key = 'LOCAL' WHERE id = $2",
          ["c".repeat(64), job.id],
        );
        assert.equal(
          (
            await client.query(
              "SELECT count(*) FROM app.thumbnail_review WHERE thumbnail_job_id = $1",
              [job.id],
            )
          ).rows[0].count,
          "0",
        );
        const review = {
          thumbnail_job_id: job.id,
          review_status: "REVIEW_REQUIRED",
          reviewer_type: "QA",
          version_no: 1,
        };
        const races = await Promise.allSettled([
          insert("thumbnail_review", review),
          insert("thumbnail_review", review),
        ]);
        assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(races.find((r) => r.status === "rejected").reason.code, "23505");
        await insert("thumbnail_review", {
          ...review,
          version_no: 2,
          review_status: "MANUAL_APPROVED",
          reviewer_type: "HUMAN",
          reviewed_at: new Date(),
        });
        await rejects(insert("thumbnail_review", { ...review, version_no: 0 }), "23514");
      },
    );

    await t.test(
      "five open codes accept new values but reject NULL, whitespace, and oversized input",
      async () => {
        const master = await insert("product_master", {
          product_name: "Open",
          product_name_norm: "open",
          product_type: "FUTURE_TYPE",
          created_method: "FUTURE_METHOD",
        });
        const batch = await insert("import_batch", {
          platform_id: platform.id,
          source_name: "open",
          import_type: "FUTURE_IMPORT",
        });
        const identifier = await insert("product_identifier", {
          product_id: master.id,
          identifier_type: "MODEL_NO",
          identifier_value: "FUTURE",
          identifier_norm: "FUTURE",
          evidence_type: "FUTURE_EVIDENCE",
        });
        const job = (await client.query("SELECT id FROM app.thumbnail_job LIMIT 1")).rows[0];
        const review = await insert("thumbnail_review", {
          thumbnail_job_id: job.id,
          version_no: 3,
          review_status: "REVIEW_REQUIRED",
          reviewer_type: "FUTURE_REVIEWER",
        });
        for (const [table, id, column] of [
          ["product_master", master.id, "product_type"],
          ["product_master", master.id, "created_method"],
          ["import_batch", batch.id, "import_type"],
          ["product_identifier", identifier.id, "evidence_type"],
          ["thumbnail_review", review.id, "reviewer_type"],
        ]) {
          for (const [value, code] of [
            [null, "23502"],
            ["", "23514"],
            [" \t\n", "23514"],
            ["X".repeat(65), "22001"],
          ]) {
            await rejects(
              client.query(`UPDATE app.${table} SET ${column} = $1 WHERE id = $2`, [value, id]),
              code,
            );
          }
        }
      },
    );

    await t.test(
      "automation profile, IANA timezone, queue pair, and request idempotency",
      async () => {
        const base = {
          job_code: "fixture",
          job_name: "Fixture",
          job_type: "BROWSER",
          handler_key: "fixture",
        };
        await rejects(insert("automation_job", base), "23514");
        await rejects(
          insert("automation_job", { ...base, profile_key: "fixture", timezone: "Invalid/Zone" }),
          "23514",
        );
        const job = await insert("automation_job", { ...base, profile_key: "fixture" });
        assert.equal(job.allow_parallel, false);
        assert.equal(job.timeout_seconds, 300);
        assert.equal(job.max_retries, 2);
        assert.equal(job.timezone, "Asia/Seoul");
        await rejects(
          client.query("UPDATE app.automation_job SET timeout_seconds = 0 WHERE id = $1", [job.id]),
          "23514",
        );
        await rejects(
          client.query("UPDATE app.automation_job SET timezone = 'Invalid/Zone' WHERE id = $1", [
            job.id,
          ]),
          "23514",
        );
        const run = { automation_job_id: job.id, request_key: "request-1", trigger_type: "MANUAL" };
        await rejects(insert("automation_run", { ...run, queue_provider: "pg-boss" }), "23514");
        await insert("automation_run", run);
        await rejects(insert("automation_run", run), "23505");
        await rejects(
          insert("automation_run", { ...run, request_key: "request-2", status: "SUCCEEDED" }),
          "23514",
        );
        await rejects(
          insert("automation_run", { ...run, request_key: "request-3", trigger_type: "INVALID" }),
          "23514",
        );
      },
    );
  },
);
