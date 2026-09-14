import assert from "node:assert/strict";
import test from "node:test";

import { createFlowRunner, FlowRunnerError } from "../dist/index.js";

function createHandler(handlerKey, calls, overrides = {}) {
  return {
    handlerKey,
    async prepare(context) {
      calls.push(`prepare:${context.runPublicId}`);
    },
    async authenticate() {
      calls.push("authenticate");
    },
    async execute(context) {
      calls.push(`execute:${Object.isFrozen(context.input)}`);
    },
    async verify() {
      calls.push("verify");
    },
    async cleanup(context) {
      calls.push(`cleanup:${context.outcome}`);
    },
    ...overrides,
  };
}

test("runs only a registered handler in the fixed lifecycle order", async () => {
  const calls = [];
  const runner = createFlowRunner([createHandler("vendor.order", calls)]);

  await runner.run({
    handlerKey: "vendor.order",
    input: { orderId: "A-100" },
    runPublicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000001",
  });

  assert.deepEqual(calls, [
    "prepare:018f0cb2-ef9d-7b29-a13d-9a4f00000001",
    "authenticate",
    "execute:true",
    "verify",
    "cleanup:SUCCEEDED",
  ]);
  assert.deepEqual(runner.registeredHandlerKeys(), ["vendor.order"]);
});

test("rejects an unregistered handler key without executing a flow", async () => {
  const calls = [];
  const runner = createFlowRunner([createHandler("vendor.order", calls)]);

  await assert.rejects(
    runner.run({ handlerKey: "db.supplied.code", runPublicId: "run-1" }),
    (error) => error instanceof FlowRunnerError && error.code === "FLOW_NOT_REGISTERED",
  );
  assert.deepEqual(calls, []);
});

test("rejects duplicate and malformed registered handler keys", () => {
  const calls = [];
  assert.throws(
    () =>
      createFlowRunner([
        createHandler("vendor.order", calls),
        createHandler("vendor.order", calls),
      ]),
    (error) => error instanceof FlowRunnerError && error.code === "DUPLICATE_FLOW_HANDLER",
  );
  assert.throws(
    () => createFlowRunner([createHandler("vendor order", calls)]),
    (error) => error instanceof FlowRunnerError && error.code === "INVALID_FLOW_HANDLER_KEY",
  );
  assert.throws(
    () => createFlowRunner([{ handlerKey: "vendor.order" }]),
    (error) => error instanceof FlowRunnerError && error.code === "INVALID_FLOW_HANDLER",
  );
});

test("runs cleanup after a failed lifecycle and does not continue to later steps", async () => {
  const calls = [];
  const runner = createFlowRunner([
    createHandler("vendor.order", calls, {
      async execute() {
        calls.push("execute");
        throw new Error("provider detail must not escape");
      },
    }),
  ]);

  await assert.rejects(
    runner.run({ handlerKey: "vendor.order", runPublicId: "run-1" }),
    (error) => error instanceof FlowRunnerError && error.code === "FLOW_EXECUTION_FAILED",
  );
  assert.deepEqual(calls, ["prepare:run-1", "authenticate", "execute", "cleanup:FAILED"]);
});

test("reports cleanup failure safely after an otherwise successful lifecycle", async () => {
  const calls = [];
  const runner = createFlowRunner([
    createHandler("vendor.order", calls, {
      async cleanup(context) {
        calls.push(`cleanup:${context.outcome}`);
        throw new Error("provider cleanup detail must not escape");
      },
    }),
  ]);

  await assert.rejects(
    runner.run({ handlerKey: "vendor.order", runPublicId: "run-1" }),
    (error) => error instanceof FlowRunnerError && error.code === "FLOW_CLEANUP_FAILED",
  );
  assert.deepEqual(calls, [
    "prepare:run-1",
    "authenticate",
    "execute:true",
    "verify",
    "cleanup:SUCCEEDED",
  ]);
});
