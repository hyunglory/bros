import { PgBoss, fromKysely } from "pg-boss";
import { createRedactedLogger } from "@bros/core";
import type { DatabaseConfig } from "@bros/core";
import type { DbTransaction } from "@bros/db";
import { queueNames } from "./port.js";
import type {
  QueueName,
  QueuePayload,
  QueuePort,
  QueueSchedule,
  QueueTransaction,
} from "./port.js";

export const queueDefaults = Object.freeze({
  retryLimit: 2,
  retryDelay: 5,
  retryDelayMax: 300,
  expireInSeconds: 900,
  pollingIntervalSeconds: 1,
  stopTimeoutMs: 10000,
  superviseIntervalSeconds: 30,
  localConcurrency: 1,
});
export type QueueAdapterOptions = { [K in keyof typeof queueDefaults]: number };

export function queueTransaction(transaction: DbTransaction): QueueTransaction {
  if (!transaction.isTransaction) throw new Error("Queue enqueue requires an active transaction");
  return fromKysely(transaction);
}

function validate(name: QueueName, data?: QueuePayload) {
  if (!queueNames.includes(name)) throw new Error("Unknown queue name");
  if (
    data !== undefined &&
    (typeof data !== "object" ||
      data === null ||
      Object.keys(data).length !== 1 ||
      !Object.hasOwn(data, "publicId") ||
      typeof data.publicId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.publicId))
  ) {
    throw new Error("Queue payload must contain only a UUIDv7 publicId");
  }
}

function requirePayload(name: QueueName, data: QueuePayload) {
  if (data === undefined) throw new Error("Queue payload is required");
  validate(name, data);
}

function requireSchedule(schedule: QueueSchedule): void {
  if (
    typeof schedule.key !== "string" ||
    schedule.key.trim() === "" ||
    typeof schedule.cron !== "string" ||
    schedule.cron.trim() === "" ||
    typeof schedule.timezone !== "string" ||
    schedule.timezone.trim() === ""
  ) {
    throw new Error("Invalid queue schedule");
  }
  requirePayload("browser.run", schedule.data);
}

export function createPgBossQueue(
  database: DatabaseConfig,
  overrides: Partial<QueueAdapterOptions> = {},
): QueuePort {
  const options = { ...queueDefaults, ...overrides };
  const bounds = {
    retryLimit: [0, 10],
    retryDelay: [1, 3600],
    retryDelayMax: [1, 86400],
    expireInSeconds: [1, 86400],
    pollingIntervalSeconds: [0.5, 60],
    stopTimeoutMs: [1000, 300000],
    superviseIntervalSeconds: [1, 3600],
    localConcurrency: [1, 100],
  } as const;
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const value = options[key];
    if (
      !Number.isFinite(value) ||
      value < bounds[key][0] ||
      value > bounds[key][1] ||
      (key !== "pollingIntervalSeconds" && !Number.isInteger(value))
    )
      throw new Error(`Invalid queue option: ${key}`);
  }
  if (options.retryDelayMax < options.retryDelay)
    throw new Error("Queue retry delay cap is too small");
  const logger = createRedactedLogger();
  const boss = new PgBoss({
    connectionString: database.url,
    schema: "bros_queue",
    max: database.poolMax,
    connectionTimeoutMillis: database.connectionTimeoutMs,
    application_name: "bros-queue",
    superviseIntervalSeconds: options.superviseIntervalSeconds,
    monitorIntervalSeconds: options.superviseIntervalSeconds,
    schedule: true,
    persistWarnings: false,
  });
  boss.on("error", () => logger.error({ code: "QUEUE_PROVIDER_ERROR" }, "Queue provider failed"));
  boss.on("warning", () =>
    logger.warn({ code: "QUEUE_PROVIDER_WARNING" }, "Queue provider warning"),
  );
  let state: "idle" | "starting" | "running" | "stopping" | "stopped" | "failed" = "idle";
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let active = 0;
  const registrations = new Set<QueueName>();
  const operations = new Set<Promise<unknown>>();
  const settings = (name: QueueName) => ({
    retryLimit: name === "browser.run" ? 0 : options.retryLimit,
    retryDelay: options.retryDelay,
    retryBackoff: true,
    retryDelayMax: options.retryDelayMax,
    expireInSeconds: options.expireInSeconds,
    retentionSeconds: 1209600,
    deleteAfterSeconds: 86400,
  });
  function perform<T>(operation: () => Promise<T>): Promise<T> {
    if (state !== "running") return Promise.reject(new Error("Queue is not running"));
    const result = operation();
    operations.add(result);
    void result.then(
      () => operations.delete(result),
      () => operations.delete(result),
    );
    return result;
  }
  return {
    getSchedules(name) {
      return perform(async () => {
        validate(name);
        try {
          return (await boss.getSchedules(name)).map((schedule) => {
            const queueSchedule: QueueSchedule = {
              cron: schedule.cron,
              data: schedule.data as QueuePayload,
              key: schedule.key,
              timezone: schedule.timezone,
            };
            requireSchedule(queueSchedule);
            return queueSchedule;
          });
        } catch {
          throw new Error("Queue schedule lookup failed");
        }
      });
    },
    start() {
      if (state === "running" || state === "starting") return starting ?? Promise.resolve();
      if (state !== "idle")
        return Promise.reject(new Error("Create a new queue adapter after stop or failure"));
      state = "starting";
      starting = (async () => {
        try {
          await boss.start();
          for (const name of queueNames) await boss.createQueue(name, settings(name));
          if (state === "starting") state = "running";
        } catch {
          state = "failed";
          await boss.stop({ graceful: false }).catch(() => undefined);
          throw new Error("Queue startup failed");
        }
      })();
      return starting;
    },
    publish(name, data, transaction) {
      return perform(async () => {
        requirePayload(name, data);
        try {
          const id = await boss.send(name, data, {
            ...settings(name),
            ...(transaction ? { db: transaction } : {}),
          });
          if (!id) throw new Error();
          return { provider: "pg-boss" as const, providerId: id };
        } catch {
          throw new Error("Queue publish failed");
        }
      });
    },
    schedule(name, schedule) {
      return perform(async () => {
        validate(name);
        requireSchedule(schedule);
        try {
          await boss.schedule(name, schedule.cron, schedule.data, {
            ...settings(name),
            key: schedule.key,
            missed: "skip",
            tz: schedule.timezone,
          });
        } catch {
          throw new Error("Queue schedule failed");
        }
      });
    },
    work(name, handler, overrides) {
      return perform(async () => {
        validate(name);
        const concurrency = overrides?.concurrency ?? options.localConcurrency;
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100)
          throw new Error("Invalid queue worker concurrency");
        if (registrations.has(name)) throw new Error("Queue handler already registered");
        registrations.add(name);
        try {
          const workOptions = {
            batchSize: 1,
            includeMetadata: true as const,
            localConcurrency: concurrency,
            pollingIntervalSeconds: options.pollingIntervalSeconds,
          };
          await boss.work<QueuePayload, undefined, typeof workOptions>(
            name,
            workOptions,
            async (jobs) => {
              for (const job of jobs) {
                active++;
                try {
                  requirePayload(name, job.data);
                  await handler({
                    provider: "pg-boss",
                    providerId: job.id,
                    data: job.data,
                    attempt: job.retryCount + 1,
                    retryLimit: job.retryLimit,
                    signal: job.signal,
                  });
                } catch {
                  // pg-boss persists thrown errors as job output; never persist the original error.
                  throw new Error("Queue handler failed");
                } finally {
                  active--;
                }
              }
            },
          );
        } catch {
          registrations.delete(name);
          throw new Error("Queue handler registration failed");
        }
      });
    },
    stop() {
      if (stopping) return stopping;
      state = "stopping";
      const cleanup = (async () => {
        await starting?.catch(() => undefined);
        await Promise.allSettled([...operations]);
        try {
          await boss.stop({ graceful: true, timeout: options.stopTimeoutMs });
          if (active) throw new Error();
        } catch {
          throw new Error("Queue stop incomplete; terminate the owning process");
        } finally {
          state = "stopped";
        }
      })();
      let deadline: ReturnType<typeof setTimeout>;
      stopping = Promise.race([
        cleanup,
        new Promise<void>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Queue stop deadline exceeded; terminate the owning process")),
            options.stopTimeoutMs,
          );
        }),
      ]).finally(() => clearTimeout(deadline));
      return stopping;
    },
    unschedule(name, key) {
      return perform(async () => {
        validate(name);
        if (typeof key !== "string" || key.trim() === "") throw new Error("Invalid queue schedule");
        try {
          await boss.unschedule(name, key);
        } catch {
          throw new Error("Queue unschedule failed");
        }
      });
    },
  };
}
