import assert from "node:assert/strict";
import test from "node:test";

import { Value } from "@sinclair/typebox/value";

import {
  AsyncAcceptedSchema,
  ErrorEnvelopeSchema,
  PaginationQuerySchema,
  PublicIdParamsSchema,
  createErrorEnvelope,
  normalizePaginationQuery,
  validateRequest,
} from "../dist/http.js";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";

test("accepts UUIDv7 public IDs and rejects internal or other UUID versions", () => {
  assert.equal(Value.Check(PublicIdParamsSchema, { publicId }), true);
  assert.equal(Value.Check(PublicIdParamsSchema, { publicId: 9_223_372_036_854_775_807n }), false);
  assert.equal(
    Value.Check(PublicIdParamsSchema, {
      publicId: "01890f47-0c4d-4abc-8def-1234567890ab",
    }),
    false,
  );
});

test("maps an invalid request to the common 400 error contract", () => {
  const internalId = "9223372036854775807";
  const result = validateRequest(PublicIdParamsSchema, { publicId: internalId }, "request-1");

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.statusCode, 400);
  assert.equal(Value.Check(ErrorEnvelopeSchema, result.body), true);
  assert.equal(result.body.error.code, "INVALID_REQUEST");
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(internalId));
});

test("validates the shared asynchronous 202 response body", () => {
  assert.equal(
    Value.Check(AsyncAcceptedSchema, {
      publicId,
      status: "QUEUED",
      statusUrl: `/api/v1/imports/${publicId}`,
    }),
    true,
  );
  assert.equal(
    Value.Check(AsyncAcceptedSchema, {
      publicId,
      status: "SUCCEEDED",
      statusUrl: `/api/v1/imports/${publicId}`,
    }),
    false,
  );
});

test("validates the common error response body", () => {
  const body = createErrorEnvelope({
    code: "VERSION_CONFLICT",
    message: "The resource changed before this request was applied",
    requestId: "request-2",
  });

  assert.equal(Value.Check(ErrorEnvelopeSchema, body), true);
});

test("applies the documented pagination default and maximum", () => {
  assert.deepEqual(normalizePaginationQuery({}), { limit: 50 });
  assert.equal(Value.Check(PaginationQuerySchema, { limit: 100 }), true);
  assert.equal(Value.Check(PaginationQuerySchema, { limit: 101 }), false);
});
