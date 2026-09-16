import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AppConfig } from "@bros/core";
import type { DatabaseClient } from "@bros/db";
import type { QueuePort } from "@bros/queue";
import {
  AcceptIdentifierRequestSchema,
  RejectIdentifierRequestSchema,
  ManualIdentifierRequestSchema,
  ReresolveIdentifierRequestSchema,
  IdentifierReviewQuerySchema,
  IdentifierReviewListSchema,
  IdentifierReviewDetailSchema,
  IdentifierRunListSchema,
  IdentifierRunDetailSchema,
  IdentifierReviewDecisionSchema,
  PublicIdParamsSchema,
  ErrorEnvelopeSchema,
  IdentifierReresolveResponseSchema,
  createErrorEnvelope,
  type IdentifierReviewQuery,
  type ManualIdentifierRequest,
} from "@bros/contracts";
import {
  createIdentifierPromotionService,
  createIdentifierReviewService,
  configuredResolverPipeline,
  enqueueResolveBatch,
  IdentifierReviewError,
  IdentifierPromotionError,
} from "@bros/resolver";
import { createIdentifierReviewManagement } from "./identifier-review-management.js";
/** Trusted server integration point; it must verify authentication before returning an actor. */
export type IdentifierReviewAuthorizer = (
  request: FastifyRequest,
) => Promise<{ actor: string } | null>;
export function registerIdentifierReviewRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  options: {
    localEnabled: boolean;
    authorize?: IdentifierReviewAuthorizer;
    queue?: QueuePort;
    config: AppConfig["resolver"];
  },
) {
  const management = createIdentifierReviewManagement(database);
  const review = createIdentifierReviewService(database),
    promotion = createIdentifierPromotionService(database);
  const actors = new WeakMap<FastifyRequest, string>();
  function actor(request: FastifyRequest) {
    const value = actors.get(request);
    if (!value) throw new Error("REVIEW_ACTOR_MISSING");
    return value;
  }
  app.addHook("onRequest", async (request, reply) => {
    if (!request.routeOptions.url?.startsWith("/api/v1/identifier/")) return;
    if (!options.authorize && !options.localEnabled)
      return reply.code(503).send(
        createErrorEnvelope({
          code: "BUSINESS_API_DISABLED",
          message: "Business API access is not configured",
          requestId: request.id,
        }),
      );
    const principal = options.authorize
      ? await options.authorize(request)
      : { actor: "local-identifier-reviewer" };
    if (!principal)
      return reply.code(401).send(
        createErrorEnvelope({
          code: "AUTHENTICATION_REQUIRED",
          message: "Administrator authentication is required",
          requestId: request.id,
        }),
      );
    actors.set(request, principal.actor);
    if (request.method !== "GET") {
      const origin = request.headers.origin;
      if (
        (origin !== undefined && origin !== `${request.protocol}://${request.headers.host}`) ||
        request.headers["sec-fetch-site"] === "cross-site" ||
        request.headers["x-bros-operation"] !== "identifier-review" ||
        request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json"
      )
        return reply.code(403).send(
          createErrorEnvelope({
            code: "REVIEW_OPERATION_FORBIDDEN",
            message: "Review operation is not allowed",
            requestId: request.id,
          }),
        );
    }
  });
  function failure(request: FastifyRequest, reply: FastifyReply, cause: unknown) {
    const code =
      cause instanceof IdentifierReviewError || cause instanceof IdentifierPromotionError
        ? cause.code
        : "IDENTIFIER_REVIEW_UNAVAILABLE";
    const status = code.endsWith("NOT_FOUND")
      ? 404
      : code.startsWith("INVALID_")
        ? 400
        : code === "RESOLVE_BACKPRESSURE"
          ? 429
          : ["IDENTIFIER_REVIEW_UNAVAILABLE", "RESOLVE_ENQUEUE_FAILED"].includes(code)
            ? 503
            : 409;
    return reply.code(status).send(
      createErrorEnvelope({
        code,
        message: "Identifier review request could not be completed",
        requestId: request.id,
      }),
    );
  }
  const errors = {
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    409: ErrorEnvelopeSchema,
    429: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
  };
  const get = (
    path: string,
    schema: object,
    action: (request: FastifyRequest) => Promise<unknown>,
  ) =>
    app.get(path, { schema }, async (request, reply) => {
      try {
        return await action(request);
      } catch (cause) {
        return failure(request, reply, cause);
      }
    });
  get(
    "/api/v1/identifier/reviews",
    {
      querystring: IdentifierReviewQuerySchema,
      response: { 200: IdentifierReviewListSchema, ...errors },
    },
    (request) => management.list(request.query as IdentifierReviewQuery),
  );
  get(
    "/api/v1/identifier/candidates/:publicId",
    { params: PublicIdParamsSchema, response: { 200: IdentifierReviewDetailSchema, ...errors } },
    (request) => management.detail((request.params as { publicId: string }).publicId),
  );
  get(
    "/api/v1/identifier/runs",
    {
      querystring: IdentifierReviewQuerySchema,
      response: { 200: IdentifierRunListSchema, ...errors },
    },
    (request) => management.listRuns(request.query as IdentifierReviewQuery),
  );
  get(
    "/api/v1/identifier/runs/:publicId",
    { params: PublicIdParamsSchema, response: { 200: IdentifierRunDetailSchema, ...errors } },
    (request) => management.run((request.params as { publicId: string }).publicId),
  );
  for (const action of ["accept", "reject"] as const)
    app.post(
      `/api/v1/identifier/candidates/:publicId/${action}`,
      {
        schema: {
          params: PublicIdParamsSchema,
          body: action === "accept" ? AcceptIdentifierRequestSchema : RejectIdentifierRequestSchema,
          response: { 200: IdentifierReviewDecisionSchema, ...errors },
        },
      },
      async (request, reply) => {
        try {
          const id = (request.params as { publicId: string }).publicId,
            body = request.body as { expectedVersion: number; reason: string };
          return action === "accept"
            ? await promotion.promoteManual({
                actor: actor(request),
                candidatePublicId: id,
                expectedVersionNo: body.expectedVersion,
              })
            : await review.reject(id, body.expectedVersion, body.reason, actor(request));
        } catch (cause) {
          return failure(request, reply, cause);
        }
      },
    );
  app.post(
    "/api/v1/identifier/runs/:publicId/manual",
    {
      schema: {
        params: PublicIdParamsSchema,
        body: ManualIdentifierRequestSchema,
        response: { 200: IdentifierReviewDecisionSchema, ...errors },
      },
    },
    async (request, reply) => {
      try {
        return await review.manual(
          (request.params as { publicId: string }).publicId,
          request.body as ManualIdentifierRequest,
          actor(request),
        );
      } catch (cause) {
        return failure(request, reply, cause);
      }
    },
  );
  app.post(
    "/api/v1/identifier/runs/:publicId/re-resolve",
    {
      schema: {
        params: PublicIdParamsSchema,
        body: ReresolveIdentifierRequestSchema,
        response: { 202: IdentifierReresolveResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      try {
        if (!options.queue) throw new Error();
        const run = await management.run((request.params as { publicId: string }).publicId);
        const pipeline = configuredResolverPipeline(database, options.config);
        const result = await enqueueResolveBatch(
          database,
          options.queue,
          {
            requestPublicId: (request.body as { requestPublicId: string }).requestPublicId,
            sourceProductPublicIds: [run.sourceProductPublicId],
            resolverVersion: pipeline.version,
          },
          {
            ...options.config,
            reviewAudit: { actor: actor(request), originRunPublicId: run.publicId },
          },
        );
        const item = result.results[0];
        if (!item?.publicId)
          throw new IdentifierReviewError(item?.code ?? "IDENTIFIER_REVIEW_UNAVAILABLE");
        const current = await management.run(item.publicId);
        return reply.code(202).send({
          publicId: item.publicId,
          status: current.status,
          statusUrl: `/api/v1/identifier/runs/${item.publicId}`,
        });
      } catch (cause) {
        return failure(request, reply, cause);
      }
    },
  );
}
