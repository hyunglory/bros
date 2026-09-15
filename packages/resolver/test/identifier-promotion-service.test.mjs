import assert from "node:assert/strict";
import test from "node:test";
import { createIdentifierPromotionService, IdentifierPromotionError } from "../dist/index.js";

test("P3-11 keeps auto promotion disabled before touching the database", async () => {
  const service = createIdentifierPromotionService(null);
  await assert.rejects(
    () => service.promoteAuto(),
    (error) =>
      error instanceof IdentifierPromotionError && error.code === "AUTO_PROMOTION_DISABLED",
  );
});

test("P3-11 rejects malformed manual approval before opening a transaction", async () => {
  const service = createIdentifierPromotionService({
    transaction: () => assert.fail("unexpected transaction"),
  });
  await assert.rejects(
    () => service.promoteManual({ candidatePublicId: "bad", actor: "admin", expectedVersionNo: 1 }),
    (error) =>
      error instanceof IdentifierPromotionError && error.code === "INVALID_PROMOTION_INPUT",
  );
});

const valid = {
  candidatePublicId: "01994ae0-0000-7000-8000-000000000001",
  actor: "reviewer",
  expectedVersionNo: 1,
};

test("P3-11 strict request validation does not evaluate accessors or accept unsafe actors", async () => {
  const service = createIdentifierPromotionService({
    transaction: () => assert.fail("unexpected transaction"),
  });
  const getter = { ...valid };
  Object.defineProperty(getter, "actor", {
    get() {
      return assert.fail("getter evaluated");
    },
  });
  for (const input of [
    null,
    [],
    {},
    getter,
    Object.create(valid),
    { ...valid, extra: true },
    { ...valid, [Symbol("extra")]: true },
    ...[0, -1, 1.5, NaN, Infinity, 2147483647, "1"].map((expectedVersionNo) => ({
      ...valid,
      expectedVersionNo,
    })),
    ...["", " reviewer", "reviewer\n", "x".repeat(129), "Bearer fixture", "api_key=fixture"].map(
      (actor) => ({ ...valid, actor }),
    ),
  ]) {
    await assert.rejects(() => service.promoteManual(input), { code: "INVALID_PROMOTION_INPUT" });
  }
});

test("P3-11 detaches the validated request before an asynchronous transaction begins", async () => {
  const input = { ...valid };
  let executeTransaction;
  const reached = new Error("query reached");
  const service = createIdentifierPromotionService({
    transaction: (callback) =>
      new Promise((resolve, reject) => {
        executeTransaction = () => {
          const query = {
            innerJoin: () => query,
            select: () => query,
            where: (column, operator, publicId) => {
              assert.equal(publicId, valid.candidatePublicId);
              return query;
            },
            executeTakeFirst: () => {
              throw reached;
            },
          };
          callback({ selectFrom: () => query }).then(resolve, reject);
        };
      }),
  });
  const pending = service.promoteManual(input);
  input.candidatePublicId = "mutated";
  executeTransaction();
  await assert.rejects(pending, (error) => error === reached);
});
