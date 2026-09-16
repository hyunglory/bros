import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table app.identifier_resolve_run
    add column admission_key varchar(73) unique,
    add column queue_json jsonb not null default '{}'::jsonb,
    add column result_json jsonb not null default '{}'::jsonb,
    add constraint ck_resolve_queue_object check (jsonb_typeof(queue_json) = 'object'),
    add constraint ck_resolve_result_object check (jsonb_typeof(result_json) = 'object')`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table app.identifier_resolve_run
    drop column result_json, drop column queue_json, drop column admission_key`.execute(db);
}
