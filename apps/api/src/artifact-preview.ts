import type { FastifyInstance } from "fastify";
import { createErrorEnvelope, ErrorEnvelopeSchema } from "@bros/contracts";
import { validateObjectKey } from "@bros/storage";
import type { ObjectStorage } from "@bros/storage";

const runPublicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isBrowserArtifactKey(objectKey: string): boolean {
  try {
    validateObjectKey(objectKey);
  } catch {
    return false;
  }
  const parts = objectKey.split("/");
  return (
    parts.length === 6 &&
    parts[0] === "automation" &&
    /^\d{4}$/.test(parts[1] ?? "") &&
    /^(?:0[1-9]|1[0-2])$/.test(parts[2] ?? "") &&
    /^(?:0[1-9]|[12]\d|3[01])$/.test(parts[3] ?? "") &&
    runPublicIdPattern.test(parts[4] ?? "") &&
    ["start.png", "failure.png", "final.png", "trace.zip", "result.json"].includes(parts[5] ?? "")
  );
}

export interface ArtifactPreviewPort {
  getAuthorizedPreviewUrl(request: { actor: string; objectKey: string }): Promise<string>;
}

/** API-side capability: only a Caddy-authenticated actor can reach this adapter. */
export function createArtifactPreviewPort(
  storage: Pick<ObjectStorage, "getSignedUrl">,
): ArtifactPreviewPort {
  return {
    async getAuthorizedPreviewUrl(request) {
      if (!isBrowserArtifactKey(request.objectKey)) throw new Error("Artifact not found");
      return storage.getSignedUrl(request.objectKey, 300);
    },
  };
}

export function registerArtifactPreviewRoutes(
  app: FastifyInstance,
  options: { preview?: ArtifactPreviewPort },
): void {
  app.get(
    "/api/v1/artifacts/preview",
    {
      schema: {
        response: { 401: ErrorEnvelopeSchema, 404: ErrorEnvelopeSchema, 503: ErrorEnvelopeSchema },
      },
    },
    async (request, reply) => {
      const objectKey = (request.query as { objectKey?: unknown }).objectKey;
      if (typeof objectKey !== "string") {
        return reply.code(404).send(
          createErrorEnvelope({
            code: "ARTIFACT_NOT_FOUND",
            message: "Artifact was not found",
            requestId: request.id,
          }),
        );
      }
      if (!options.preview || request.auditActor === null) {
        return reply.code(503).send(
          createErrorEnvelope({
            code: "ARTIFACT_PREVIEW_UNAVAILABLE",
            message: "Artifact preview is unavailable",
            requestId: request.id,
          }),
        );
      }
      try {
        return {
          url: await options.preview.getAuthorizedPreviewUrl({
            actor: request.auditActor,
            objectKey,
          }),
        };
      } catch {
        return reply.code(404).send(
          createErrorEnvelope({
            code: "ARTIFACT_NOT_FOUND",
            message: "Artifact was not found",
            requestId: request.id,
          }),
        );
      }
    },
  );
}
