import { Type } from "@sinclair/typebox";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const publicIdPattern =
  "^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-7[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$";

export const PublicIdSchema = Type.String({
  description: "Externally visible UUIDv7 resource identifier",
  pattern: publicIdPattern,
});

export type PublicId = Static<typeof PublicIdSchema>;

export const PublicIdParamsSchema = Type.Object(
  {
    publicId: PublicIdSchema,
  },
  { additionalProperties: false },
);

export type PublicIdParams = Static<typeof PublicIdParamsSchema>;

export const ExpectedVersionSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type ExpectedVersion = Static<typeof ExpectedVersionSchema>;

export const PaginationQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
    limit: Type.Optional(Type.Integer({ default: 50, minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export interface NormalizedPaginationQuery {
  cursor?: string;
  limit: number;
}

export function normalizePaginationQuery(query: PaginationQuery): NormalizedPaginationQuery {
  return {
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: query.limit ?? 50,
  };
}

export const AsyncAcceptedSchema = Type.Object(
  {
    publicId: PublicIdSchema,
    status: Type.Literal("QUEUED"),
    statusUrl: Type.String({ pattern: "^/api/v1/", maxLength: 2_048 }),
  },
  { additionalProperties: false },
);

export type AsyncAccepted = Static<typeof AsyncAcceptedSchema>;

export const HttpErrorStatusSchema = Type.Union([
  Type.Literal(400),
  Type.Literal(401),
  Type.Literal(403),
  Type.Literal(404),
  Type.Literal(409),
  Type.Literal(413),
  Type.Literal(429),
  Type.Literal(503),
]);

export type HttpErrorStatus = Static<typeof HttpErrorStatusSchema>;

export const ErrorEnvelopeSchema = Type.Object(
  {
    error: Type.Object(
      {
        code: Type.String({
          minLength: 3,
          maxLength: 64,
          pattern: "^[A-Z][A-Z0-9_]*$",
        }),
        message: Type.String({ minLength: 1, maxLength: 512 }),
        requestId: Type.String({ minLength: 1, maxLength: 128 }),
        details: Type.Optional(
          Type.Record(Type.String({ minLength: 1, maxLength: 64 }), Type.Unknown()),
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ErrorEnvelope = Static<typeof ErrorEnvelopeSchema>;

export interface ApiErrorResponse {
  statusCode: HttpErrorStatus;
  body: ErrorEnvelope;
}

export function createErrorEnvelope(input: {
  code: string;
  details?: Readonly<Record<string, unknown>>;
  message: string;
  requestId: string;
}): ErrorEnvelope {
  return {
    error: {
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  };
}

export type RequestValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      statusCode: 400;
      body: ErrorEnvelope;
    };

export function validateRequest<T extends TSchema>(
  schema: T,
  value: unknown,
  requestId: string,
): RequestValidationResult<Static<T>> {
  if (Value.Check(schema, value)) {
    return { ok: true, value: value as Static<T> };
  }

  const issues = [...Value.Errors(schema, value)].slice(0, 20).map((error) => ({
    path: error.path || "$",
    rule: error.type,
  }));

  return {
    ok: false,
    statusCode: 400,
    body: createErrorEnvelope({
      code: "INVALID_REQUEST",
      message: "Request validation failed",
      requestId,
      details: { issues },
    }),
  };
}
