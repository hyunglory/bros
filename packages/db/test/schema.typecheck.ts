import type { Kysely, Selectable, Insertable, Updateable } from "kysely";
import type { Database, PlatformTable, SourceProductTable } from "../src/schema.js";

export function checkQueryTypes(db: Kysely<Database>) {
  db.selectFrom("app.platform").select("public_id");
  // @ts-expect-error Unknown columns must fail before execution.
  db.selectFrom("app.platform").select("missing_column");
  // @ts-expect-error Schema-qualified table names prevent accidental search_path resolution.
  db.selectFrom("platform");
  // @ts-expect-error Internal BIGINT identifiers cannot be lossy JS numbers.
  db.selectFrom("app.platform").where("id", "=", 1);
  // @ts-expect-error Closed platform roles are not arbitrary strings.
  db.updateTable("app.platform").set({ platform_role: "INVALID" });
}

export function checkColumnTypes(row: Selectable<SourceProductTable>) {
  const preciseId: string = row.id;
  const precisePrice: string | null = row.current_price;
  const timestamp: Date = row.collected_at;
  // @ts-expect-error Raw JSON insert is serialized explicitly, not passed as a JS array to pg.
  const raw: Insertable<SourceProductTable>["raw_json"] = [];
  const identity: Insertable<PlatformTable> = {
    // @ts-expect-error GENERATED ALWAYS identity cannot be set by application inserts.
    id: "123",
    code: "NEW",
    name: "New",
    platform_role: "SOURCE",
  };
  // @ts-expect-error Public identity is immutable at the typed repository boundary.
  const publicId: Updateable<PlatformTable> = { public_id: "01890f47-0c4d-7abc-8def-1234567890ab" };
  return { preciseId, precisePrice, timestamp, raw, identity, publicId };
}
