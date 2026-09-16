import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create schema bros_provider`.execute(db);
  await sql`create table bros_provider.account (
    id char(64) primary key,
    provider_key varchar(64) not null,
    account_key varchar(64) not null,
    daily_budget_microusd bigint not null check (daily_budget_microusd between 1 and 9007199254740991),
    request_cost_microusd bigint not null check (request_cost_microusd between 1 and daily_budget_microusd),
    min_interval_ms integer not null check (min_interval_ms between 1 and 86400000),
    rate_limit_cooldown_ms integer not null check (rate_limit_cooldown_ms between 1 and 86400000),
    active_reservation_id uuid,
    next_allowed_at timestamptz not null default '1970-01-01T00:00:00Z',
    unique (provider_key, account_key)
  )`.execute(db);
  await sql`create table bros_provider.daily_budget (
    account_id char(64) not null references bros_provider.account(id),
    utc_day date not null,
    reserved_microusd bigint not null default 0 check (reserved_microusd between 0 and 9007199254740991),
    primary key (account_id, utc_day)
  )`.execute(db);
  await sql`create table bros_provider.reservation (
    id uuid primary key,
    account_id char(64) not null references bros_provider.account(id),
    utc_day date not null,
    cost_microusd bigint not null check (cost_microusd between 1 and 9007199254740991),
    provider_id varchar(128) not null,
    owner_id varchar(128) not null,
    status varchar(16) not null check (status in ('ACTIVE','RELEASED','RECOVERED')),
    reserved_at timestamptz not null default clock_timestamp(),
    finished_at timestamptz,
    recovery_actor varchar(128),
    recovery_reason varchar(512),
    check ((status = 'ACTIVE' and finished_at is null and recovery_actor is null and recovery_reason is null)
      or (status = 'RELEASED' and finished_at is not null and recovery_actor is null and recovery_reason is null)
      or (status = 'RECOVERED' and finished_at is not null and length(btrim(recovery_actor)) > 0 and recovery_actor is not null
        and length(btrim(recovery_reason)) > 0 and recovery_reason is not null))
  )`.execute(db);
  await sql`alter table bros_provider.account add constraint fk_provider_active_reservation
    foreign key (active_reservation_id) references bros_provider.reservation(id)`.execute(db);
  await sql`create index ix_provider_reservation_day on bros_provider.reservation(account_id, utc_day)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table bros_provider.account drop constraint fk_provider_active_reservation`.execute(
    db,
  );
  await sql`drop table bros_provider.reservation`.execute(db);
  await sql`drop table bros_provider.daily_budget`.execute(db);
  await sql`drop table bros_provider.account`.execute(db);
  await sql`drop schema bros_provider`.execute(db);
}
