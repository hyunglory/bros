import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "@bros/core";
import { createErrorEnvelope } from "@bros/contracts";

declare module "fastify" {
  interface FastifyRequest {
    auditActor: string | null;
  }
}

const actorPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const stateChangingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function tokensMatch(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function isBusinessRequest(url: string): boolean {
  return url.startsWith("/api/v1/");
}

export function registerApiSecurity(app: FastifyInstance, config: AppConfig): void {
  app.decorateRequest("auditActor", null);
  app.addHook("onRequest", async (request, reply) => {
    if (!isBusinessRequest(request.url)) return;

    const actor =
      config.api.auth.mode === "local"
        ? config.api.localUnauthenticated
          ? "local-admin"
          : undefined
        : tokensMatch(
              headerValue(request, "x-bros-proxy-token"),
              config.api.auth.proxyAuthToken ?? "",
            )
          ? headerValue(request, "x-bros-actor")
          : undefined;
    if (actor === undefined || !actorPattern.test(actor)) {
      return reply.code(401).send(
        createErrorEnvelope({
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required",
          requestId: request.id,
        }),
      );
    }
    request.auditActor = actor;

    if (config.api.auth.mode !== "proxy" || !stateChangingMethods.has(request.method)) return;
    if (headerValue(request, "origin") !== config.api.auth.publicOrigin) {
      return reply.code(403).send(
        createErrorEnvelope({
          code: "ORIGIN_REJECTED",
          message: "Request origin is not allowed",
          requestId: request.id,
        }),
      );
    }
    if (headerValue(request, "content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
      return reply.code(400).send(
        createErrorEnvelope({
          code: "INVALID_CONTENT_TYPE",
          message: "Content-Type must be application/json",
          requestId: request.id,
        }),
      );
    }
  });
}
