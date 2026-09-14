import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of statements) await sql.raw(statement).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE app.artifact_retention_event`.execute(db);
}

const statements = [
  `CREATE TABLE app.artifact_retention_event (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  public_id uuid NOT NULL DEFAULT uuidv7() UNIQUE,
  object_key text NOT NULL CHECK (object_key ~ '[^[:space:]]'),
  event_type varchar(32) NOT NULL CHECK (event_type IN ('HOLD_SET', 'HOLD_RELEASED', 'DELETED', 'DELETE_FAILED')),
  hold_until timestamptz,
  reason text,
  storage_provider varchar(30),
  storage_bucket text,
  error_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((storage_provider IS NULL) = (storage_bucket IS NULL)),
  CHECK (event_type <> 'HOLD_SET' OR reason ~ '[^[:space:]]'),
  CHECK (event_type <> 'DELETE_FAILED' OR error_code ~ '[^[:space:]]'),
  CHECK (event_type NOT IN ('HOLD_SET', 'HOLD_RELEASED') OR (storage_provider IS NULL AND error_code IS NULL))
)`,
  `CREATE INDEX artifact_retention_event_object_id_idx ON app.artifact_retention_event (object_key, id DESC)`,
  `CREATE INDEX artifact_retention_event_type_created_idx ON app.artifact_retention_event (event_type, created_at)`,
];
