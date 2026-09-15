import { createHash, randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { DatabaseClient, DbTransaction } from "@bros/db";
import { maskSensitiveText } from "@bros/core";
import {
  ExternalProviderFailure,
  type ProviderRequestQuota,
} from "./external-candidate-provider.js";

export interface ProviderQuotaPolicy {
  /** Stable vendor/billing namespace, independent of adapter versions. */
  providerKey: string;
  providerId: string;
  accountKey: string;
  ownerId: string;
  dailyBudgetMicrousd: number;
  requestCostMicrousd: number;
  minIntervalMs: number;
  rateLimitCooldownMs: number;
}
export class ProviderQuotaError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProviderQuotaError";
  }
}
const failure = (code: string): never => {
  throw new ProviderQuotaError(code);
};
const safeName = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value) &&
  maskSensitiveText(value) === value;
const positive = (value: number, max: number) =>
  Number.isSafeInteger(value) && value > 0 && value <= max;
const aborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new ExternalProviderFailure("TIMEOUT", 0, false);
};
interface Account {
  daily_budget_microusd: string;
  request_cost_microusd: string;
  min_interval_ms: number;
  rate_limit_cooldown_ms: number;
  active_reservation_id: string | null;
}

/** Short transactions only. The durable ACTIVE row, not an open DB connection, covers network work. */
export function createPostgresProviderQuota(database: DatabaseClient, value: ProviderQuotaPolicy) {
  if (
    !value ||
    !safeName(value.providerKey, 64) ||
    !safeName(value.providerId, 128) ||
    !safeName(value.accountKey, 64) ||
    !safeName(value.ownerId, 128) ||
    !positive(value.dailyBudgetMicrousd, Number.MAX_SAFE_INTEGER) ||
    !positive(value.requestCostMicrousd, value.dailyBudgetMicrousd) ||
    !positive(value.minIntervalMs, 86400000) ||
    !positive(value.rateLimitCooldownMs, 86400000)
  )
    failure("INVALID_QUOTA_POLICY");
  const policy = Object.freeze({ ...value });
  const accountId = createHash("sha256")
    .update(JSON.stringify([policy.providerKey, policy.accountKey]))
    .digest("hex");
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (cause) {
      if (cause instanceof ProviderQuotaError || cause instanceof ExternalProviderFailure)
        throw cause;
      return failure("QUOTA_STORAGE_FAILED");
    }
  }
  async function lock(tx: DbTransaction): Promise<Account> {
    const row = (
      await sql<Account>`select daily_budget_microusd::text, request_cost_microusd::text,
      min_interval_ms, rate_limit_cooldown_ms, active_reservation_id
      from bros_provider.account where id = ${accountId} for update`.execute(tx)
    ).rows[0];
    if (!row) return failure("QUOTA_ACCOUNT_NOT_FOUND");
    if (
      row.daily_budget_microusd !== String(policy.dailyBudgetMicrousd) ||
      row.request_cost_microusd !== String(policy.requestCostMicrousd) ||
      row.min_interval_ms !== policy.minIntervalMs ||
      row.rate_limit_cooldown_ms !== policy.rateLimitCooldownMs
    )
      return failure("QUOTA_POLICY_MISMATCH");
    return row;
  }
  async function acquire(signal: AbortSignal): Promise<string> {
    aborted(signal);
    const id = randomUUID();
    await guarded(() =>
      database.transaction(async (tx) => {
        await sql`insert into bros_provider.account (id, provider_key, account_key, daily_budget_microusd,
        request_cost_microusd, min_interval_ms, rate_limit_cooldown_ms)
        values (${accountId}, ${policy.providerKey}, ${policy.accountKey}, ${policy.dailyBudgetMicrousd},
          ${policy.requestCostMicrousd}, ${policy.minIntervalMs}, ${policy.rateLimitCooldownMs}) on conflict do nothing`.execute(
          tx,
        );
        const row = await lock(tx);
        aborted(signal);
        if (row.active_reservation_id)
          throw new ExternalProviderFailure("RATE_LIMIT", policy.minIntervalMs, false);
        // Separate statement after the lock: DB wall clock, never transaction-start or a worker's clock.
        const timing = (
          await sql<{ utc_day: string; wait_ms: number }>`select
        to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD') as utc_day,
        greatest(0, ceil(extract(epoch from (next_allowed_at - clock_timestamp())) * 1000))::integer as wait_ms
        from bros_provider.account where id = ${accountId}`.execute(tx)
        ).rows[0];
        if (!timing) return failure("QUOTA_ACCOUNT_NOT_FOUND");
        if (timing.wait_ms > 0)
          throw new ExternalProviderFailure("RATE_LIMIT", timing.wait_ms, false);
        await sql`insert into bros_provider.daily_budget (account_id, utc_day) values (${accountId}, ${timing.utc_day}::date)
        on conflict do nothing`.execute(tx);
        const reserved =
          await sql`update bros_provider.daily_budget set reserved_microusd = reserved_microusd + ${policy.requestCostMicrousd}::bigint
        where account_id = ${accountId} and utc_day = ${timing.utc_day}::date
        and reserved_microusd <= ${policy.dailyBudgetMicrousd - policy.requestCostMicrousd}::bigint returning account_id`.execute(
            tx,
          );
        if (!reserved.rows.length) throw new ExternalProviderFailure("BUDGET_EXCEEDED", 0, false);
        aborted(signal);
        await sql`insert into bros_provider.reservation(id, account_id, utc_day, cost_microusd, provider_id, owner_id, status)
        values (${id}::uuid, ${accountId}, ${timing.utc_day}::date, ${policy.requestCostMicrousd}, ${policy.providerId}, ${policy.ownerId}, 'ACTIVE')`.execute(
          tx,
        );
        await sql`update bros_provider.account set active_reservation_id = ${id}::uuid where id = ${accountId}`.execute(
          tx,
        );
      }),
    );
    return id;
  }
  async function release(
    id: string,
    cooldownMs: number,
    recovery?: { actor: string; reason: string },
  ) {
    await guarded(() =>
      database.transaction(async (tx) => {
        const row = await lock(tx);
        if (row.active_reservation_id !== id) return failure("QUOTA_LEASE_CONFLICT");
        const updated =
          await sql`update bros_provider.reservation set status = ${recovery ? "RECOVERED" : "RELEASED"},
        finished_at = clock_timestamp(), recovery_actor = ${recovery?.actor ?? null}, recovery_reason = ${recovery?.reason ?? null}
        where id = ${id}::uuid and account_id = ${accountId} and status = 'ACTIVE' returning id`.execute(
            tx,
          );
        if (!updated.rows.length) return failure("QUOTA_LEASE_CONFLICT");
        await sql`update bros_provider.account set active_reservation_id = null,
        next_allowed_at = clock_timestamp() + ${Math.max(policy.minIntervalMs, cooldownMs)} * interval '1 millisecond'
        where id = ${accountId}`.execute(tx);
      }),
    );
  }
  const quota: ProviderRequestQuota = {
    scope: "SHARED_DURABLE",
    async execute(request, perform) {
      if (
        !request ||
        request.providerId !== policy.providerId ||
        request.costMicrousd !== policy.requestCostMicrousd ||
        request.dailyBudgetMicrousd !== policy.dailyBudgetMicrousd ||
        request.minIntervalMs !== policy.minIntervalMs ||
        request.rateLimitCooldownMs !== policy.rateLimitCooldownMs ||
        typeof perform !== "function"
      )
        throw new ExternalProviderFailure("PROVIDER_NOT_CONFIGURED", 0, false);
      const id = await acquire(request.signal);
      let cooldownMs = policy.minIntervalMs;
      try {
        aborted(request.signal);
        return await perform();
      } catch (cause) {
        if (cause instanceof ExternalProviderFailure && cause.code === "RATE_LIMIT")
          cooldownMs = Math.max(
            policy.rateLimitCooldownMs,
            Math.min(86400000, Math.max(0, cause.retryAfterMs)),
          );
        throw cause;
      } finally {
        // Even an aborted call retains its reservation. Release only when the actual callback settles.
        await release(id, cooldownMs);
      }
    },
  };
  return {
    ...quota,
    async inspect() {
      return guarded(
        async () =>
          (
            await sql<{
              activeReservationId: string | null;
              ownerId: string | null;
              nextAllowedAt: Date;
              utcDay: string;
              reservedMicrousd: string;
              dailyBudgetMicrousd: string;
            }>`select
        a.active_reservation_id as "activeReservationId", r.owner_id as "ownerId", a.next_allowed_at as "nextAllowedAt",
        to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD') as "utcDay",
        coalesce(b.reserved_microusd, 0)::text as "reservedMicrousd", a.daily_budget_microusd::text as "dailyBudgetMicrousd"
        from bros_provider.account a left join bros_provider.reservation r on r.id = a.active_reservation_id
        left join bros_provider.daily_budget b on b.account_id = a.id and b.utc_day = (clock_timestamp() at time zone 'UTC')::date
        where a.id = ${accountId}`.execute(database.db)
          ).rows[0] ?? null,
      );
    },
    /** Operator-only: confirm the owning process/transport is stopped first. No automatic lease expiry/refund. */
    async recoverAbandoned(request: { reservationId: string; actor: string; reason: string }) {
      const text = (v: unknown, max: number): v is string =>
        typeof v === "string" &&
        v.length > 0 &&
        v.length <= max &&
        v.trim() === v &&
        maskSensitiveText(v) === v;
      if (
        !request ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          request.reservationId,
        ) ||
        !text(request.actor, 128) ||
        !text(request.reason, 512)
      )
        return failure("INVALID_QUOTA_RECOVERY");
      await release(request.reservationId, policy.rateLimitCooldownMs, request);
    },
  };
}
