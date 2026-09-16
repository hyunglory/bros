import { randomUUID } from "node:crypto";
import Fastify, { LogController } from "fastify";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "@bros/core";
import { createRedactedLogger } from "@bros/core";
import { createPgBossQueue } from "@bros/queue";
import type { QueuePort } from "@bros/queue";
import {
  createErrorEnvelope,
  ErrorEnvelopeSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
} from "@bros/contracts";
import { createApiDataAccess } from "./database.js";
import { registerBrandReviewRoutes } from "./brand-review.js";
import { registerImportManagementRoutes } from "./import-management.js";
import { registerProductManagementRoutes } from "./product-management.js";
import {
  registerIdentifierReviewRoutes,
  type IdentifierReviewAuthorizer,
} from "./identifier-review.js";

export interface ApiAppOptions {
  queue?: QueuePort;
  identifierReviewAuthorize?: IdentifierReviewAuthorizer;
}

export function createApiApp(
  config: AppConfig,
  logger: FastifyBaseLogger = createRedactedLogger(),
  options: ApiAppOptions = {},
) {
  const data = createApiDataAccess(config.database);
  const businessEnabled = config.api.localUnauthenticated;
  const queue =
    businessEnabled || options.identifierReviewAuthorize
      ? (options.queue ?? createPgBossQueue(config.database))
      : undefined;
  const app = Fastify({
    loggerInstance: logger,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    forceCloseConnections: "idle",
    // Our onRequest gate supplies the shared error envelope during drain.
    return503OnClosing: false,
    bodyLimit: 1048576,
    requestTimeout: 30000,
    ajv: { customOptions: { removeAdditional: false } },
  });
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let probe: Promise<boolean> | undefined;
  let queueReady = false;
  let startPromise: Promise<void> | undefined;
  // Share any still-running probe so repeated timeouts cannot fill the pool queue.
  async function isReady(): Promise<boolean> {
    probe ??= data.database.db
      .selectNoFrom((eb) => eb.val(1).as("alive"))
      .execute()
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        probe = undefined;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const databaseReady = await Promise.race([
        probe,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), config.api.readinessTimeoutMs);
        }),
      ]);
      return databaseReady && (!queue || queueReady);
    } finally {
      clearTimeout(timer);
    }
  }
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    reply.header("cache-control", "no-store");
    if (closing)
      return reply.code(503).send(
        createErrorEnvelope({
          code: "SERVICE_UNAVAILABLE",
          message: "Service is shutting down",
          requestId: request.id,
        }),
      );
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      { statusCode: reply.statusCode, elapsedMs: reply.elapsedTime },
      "Request completed",
    );
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    if (closing) reply.header("connection", "close");
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
    const validation = error instanceof Error && "validation" in error && error.validation;
    const status =
      validation || statusCode === 400
        ? 400
        : statusCode === 413
          ? 413
          : statusCode === 415
            ? 400
            : 500;
    const code =
      status === 400 ? "INVALID_REQUEST" : status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL_ERROR";
    if (status === 500) request.log.error({ code }, "Request failed");
    return reply.code(status).send(
      createErrorEnvelope({
        code,
        message: status === 500 ? "Internal server error" : "Request rejected",
        requestId: request.id,
      }),
    );
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(
      createErrorEnvelope({
        code: "NOT_FOUND",
        message: "Resource not found",
        requestId: request.id,
      }),
    ),
  );
  app.get("/health", { schema: { response: { 200: HealthResponseSchema } } }, async () => ({
    status: "ok",
  }));
  app.get(
    "/ready",
    { schema: { response: { 200: ReadyResponseSchema, 503: ErrorEnvelopeSchema } } },
    async (request, reply) => {
      if ((await isReady()) && !closing) return { status: "ready" };
      return reply.code(503).send(
        createErrorEnvelope({
          code: "SERVICE_UNAVAILABLE",
          message: "Service is not ready",
          requestId: request.id,
        }),
      );
    },
  );
  registerImportManagementRoutes(app, data.database, {
    enabled: businessEnabled,
    ...(queue ? { queue } : {}),
    maxQueuedBatches: config.importer.maxQueuedBatches,
  });
  registerBrandReviewRoutes(app, data.database, {
    enabled: businessEnabled,
    ...(queue ? { queue } : {}),
    maxQueuedBatches: config.importer.maxQueuedBatches,
  });
  registerProductManagementRoutes(app, data.database, { enabled: businessEnabled });
  registerIdentifierReviewRoutes(app, data.database, {
    localEnabled: businessEnabled,
    config: config.resolver,
    ...(options.identifierReviewAuthorize ? { authorize: options.identifierReviewAuthorize } : {}),
    ...(queue ? { queue } : {}),
  });
  app.addHook("preClose", async () => {
    closing = true;
  });
  app.addHook("onClose", async () => {
    try {
      if (queueReady) await queue?.stop();
    } finally {
      await data.database.close();
    }
  });
  return {
    app,
    data,
    start: () =>
      (startPromise ??= (async () => {
        if (!queue) return;
        await queue.start();
        queueReady = true;
      })()),
    close: () => {
      closing = true;
      return (closePromise ??= app.close());
    },
  };
}
