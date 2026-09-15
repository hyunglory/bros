import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { createMigrator, migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

function documentedColumns(markdown) {
  let table;
  const columns = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (/^## [a-z_]+$/.test(line)) table = line.slice(3);
    if (!table || !line.startsWith("| ")) continue;
    const [name, type, nullable, defaultValue, rule] = line
      .split("|")
      .slice(1)
      .map((s) => s.trim());
    if (!/^[a-z_]+$/.test(name) || !["NN", "NULL"].includes(nullable)) continue;
    columns.push({ table, name, type, nullable: nullable === "NULL", defaultValue, rule });
  }
  return columns;
}

function normalizeType(type) {
  return type
    .replace("character varying", "varchar")
    .replace("character", "char")
    .replace("timestamp with time zone", "timestamptz");
}

function normalizeDefault(value) {
  return value.replace(/::(?:character varying|text\[\]|text|jsonb)/g, "");
}

test(
  "PostgreSQL baseline matches the documented physical contract",
  { timeout: 120_000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    t.after(fixture.cleanup);
    const { client, db } = fixture;
    const spec = await readFile(
      new URL("../../docs/DB_MIGRATION_SPEC.md", import.meta.url),
      "utf8",
    );
    const expected = documentedColumns(spec);
    assert.equal(expected.length, 259);
    const version = await client.query("SHOW server_version_num");
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10_000), 18);
    const tableNames = [...new Set(expected.map((column) => column.table))].sort();
    assert.equal(tableNames.length, 18);

    await t.test("failed DDL rolls back and a corrected retry succeeds", async () => {
      await client.query("CREATE SCHEMA app; CREATE TABLE app.brand (collision integer)");
      await assert.rejects(migrateToLatest(db), /Database migration failed/);
      const remaining = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'app'",
      );
      assert.deepEqual(
        remaining.rows.map((r) => r.tablename),
        ["brand"],
      );
      await client.query("DROP TABLE app.brand; DROP SCHEMA app");
      await migrateToLatest(db);
    });

    await t.test("repeat and concurrent migration requests are no-ops", async () => {
      await Promise.all([migrateToLatest(db), migrateToLatest(db)]);
      const history = await client.query("SELECT count(*) FROM bros_migrations.kysely_migration");
      assert.equal(history.rows[0].count, "4");
    });

    await t.test(
      "all 259 columns have the documented type, NULL, identity, and default",
      async () => {
        const result = await client.query(`
      SELECT c.relname AS table_name, a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS type,
             NOT a.attnotnull AS nullable, a.attidentity AS identity,
             pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'app' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    `);
        assert.equal(result.rowCount, expected.length);
        assert.deepEqual([...new Set(result.rows.map((r) => r.table_name))].sort(), tableNames);
        for (const column of expected) {
          const actual = result.rows.find(
            (r) => r.table_name === column.table && r.name === column.name,
          );
          const label = `${column.table}.${column.name}`;
          assert.ok(actual, label);
          assert.equal(normalizeType(actual.type), column.type, label);
          assert.equal(actual.nullable, column.nullable, label);
          if (column.defaultValue === "IDENTITY") {
            assert.equal(actual.identity, "a", label);
          } else if (column.defaultValue === "—") {
            assert.equal(actual.default_value, null, label);
          } else {
            assert.equal(
              normalizeDefault(actual.default_value),
              normalizeDefault(column.defaultValue),
              label,
            );
          }
        }
      },
    );

    await t.test(
      "every table has BIGINT PK, UUID uniqueness, and indexed restrictive FKs",
      async () => {
        const keys = await client.query(`
      SELECT c.relname AS table_name, con.contype, con.confdeltype,
             ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(num, ord)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num ORDER BY k.ord)::text[] AS columns,
             CASE WHEN con.contype = 'f' THEN EXISTS (
               SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid = i.indexrelid
               JOIN pg_am am ON am.oid = ix.relam
               WHERE i.indrelid = con.conrelid AND i.indisvalid AND i.indpred IS NULL
                 AND am.amname = 'btree' AND i.indkey[0] = con.conkey[1]
             ) ELSE true END AS indexed
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app'
    `);
        for (const table of tableNames) {
          assert.ok(
            keys.rows.some(
              (k) => k.table_name === table && k.contype === "p" && k.columns.join() === "id",
            ),
            table,
          );
          assert.ok(
            keys.rows.some(
              (k) =>
                k.table_name === table && k.contype === "u" && k.columns.join() === "public_id",
            ),
            table,
          );
        }
        for (const column of expected.filter(
          (c) => c.rule !== "—" && !/^(PRIMARY KEY|UNIQUE|REFERENCES)/.test(c.rule),
        )) {
          assert.ok(
            keys.rows.some(
              (k) =>
                k.table_name === column.table &&
                k.contype === "c" &&
                k.columns.includes(column.name),
            ),
            `${column.table}.${column.name} CHECK`,
          );
        }
        const fks = keys.rows.filter((k) => k.contype === "f");
        assert.equal(fks.length, 26);
        for (const fk of fks) {
          assert.equal(fk.confdeltype, "r", fk.table_name);
          assert.equal(fk.indexed, true, `${fk.table_name}.${fk.columns.join()}`);
        }
        const indexes = await client.query(
          "SELECT indexdef FROM pg_indexes WHERE schemaname = 'app'",
        );
        assert.ok(
          indexes.rows.some((r) => /USING gin.*product_name_norm.*gin_trgm_ops/.test(r.indexdef)),
        );
        assert.ok(indexes.rows.every((r) => !/USING gin.*raw_json/.test(r.indexdef)));
      },
    );

    await t.test("four documented platform seeds exist and IDs stay lossless", async () => {
      const rows = await client.query("SELECT code, platform_role FROM app.platform ORDER BY code");
      assert.deepEqual(rows.rows, [
        { code: "COUPANG", platform_role: "CHANNEL" },
        { code: "MUSINSA", platform_role: "SOURCE" },
        { code: "NAVER", platform_role: "CHANNEL" },
        { code: "OLIVEYOUNG", platform_role: "SOURCE" },
      ]);
      const id = await client.query(
        "SELECT 9007199254740993::bigint AS id, 1234567890123456.1234::numeric(20,4) AS amount",
      );
      assert.equal(id.rows[0].id, "9007199254740993");
      assert.equal(id.rows[0].amount, "1234567890123456.1234");
    });

    await t.test("down then forward succeeds on this disposable database", async () => {
      const quotaResult = await createMigrator(db).migrateDown();
      assert.equal(quotaResult.error, undefined);
      const result = await createMigrator(db).migrateDown();
      assert.equal(result.error, undefined);
      const compatResult = await createMigrator(db).migrateDown();
      assert.equal(compatResult.error, undefined);
      const baselineResult = await createMigrator(db).migrateDown();
      assert.equal(baselineResult.error, undefined);
      const rows = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'app'");
      assert.equal(rows.rowCount, 0);
      await migrateToLatest(db);
      assert.equal((await client.query("SELECT count(*) FROM app.platform")).rows[0].count, "4");
    });

    await t.test(
      "CLI reports success and configuration failure without leaking connection details",
      async () => {
        const cli = fileURLToPath(new URL("../../scripts/migrate.mjs", import.meta.url));
        const run = promisify(execFile);
        const env = {
          ...process.env,
          APP_ENV: "development",
          DATABASE_URL: fixture.connectionString,
        };
        const success = await run(process.execPath, [cli], { env, timeout: 15_000 });
        assert.match(success.stdout, /Database migrations are up to date/);
        await assert.rejects(
          run(process.execPath, [cli], {
            env: { ...env, DATABASE_URL: "invalid-sensitive-marker" },
            timeout: 15_000,
          }),
          (error) => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /Database migration failed/);
            assert.equal(error.stderr.includes("invalid-sensitive-marker"), false);
            return true;
          },
        );
      },
    );
  },
);
