import assert from "node:assert/strict";
import test from "node:test";

import { createSchedulerService, SchedulerServiceError } from "../dist/index.js";

function createFixture(jobs, registeredHandlerKeys = ["vendor.order"]) {
  const calls = [];
  const schedules = new Map();
  const queue = {
    async getSchedules(name) {
      assert.equal(name, "browser.run");
      return [...schedules.values()];
    },
    async schedule(name, schedule) {
      assert.equal(name, "browser.run");
      calls.push({ type: "schedule", ...schedule });
      schedules.set(schedule.key, schedule);
    },
    async unschedule(name, key) {
      assert.equal(name, "browser.run");
      calls.push({ key, type: "unschedule" });
      schedules.delete(key);
    },
  };
  const service = createSchedulerService({
    flowRegistry: { registeredHandlerKeys: () => registeredHandlerKeys },
    queue,
    repository: { listBrowserJobs: async () => jobs },
  });
  return { calls, schedules, service };
}

const activeJob = {
  cronExpression: "0 9 * * 1-5",
  enabled: true,
  handlerKey: "vendor.order",
  publicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000001",
  timezone: "Asia/Seoul",
};

test("recreates every active browser schedule when a worker starts", async () => {
  const fixture = createFixture([activeJob]);

  await fixture.service.reconcile();

  assert.deepEqual(fixture.calls, [
    {
      cron: "0 9 * * 1-5",
      data: { publicId: activeJob.publicId },
      key: `automation:${activeJob.publicId}`,
      timezone: "Asia/Seoul",
      type: "schedule",
    },
  ]);
});

test("updates changed schedules and removes disabled or deleted browser jobs", async () => {
  const fixture = createFixture([{ ...activeJob, cronExpression: "30 10 * * 1-5" }]);
  fixture.schedules.set(`automation:${activeJob.publicId}`, {
    cron: "0 9 * * 1-5",
    data: { publicId: activeJob.publicId },
    key: `automation:${activeJob.publicId}`,
    timezone: "Asia/Seoul",
  });
  fixture.schedules.set("automation:removed-job", {
    cron: "0 0 * * *",
    data: { publicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000002" },
    key: "automation:removed-job",
    timezone: "Asia/Seoul",
  });

  await fixture.service.reconcile();

  assert.deepEqual(fixture.calls, [
    { key: "automation:removed-job", type: "unschedule" },
    {
      cron: "30 10 * * 1-5",
      data: { publicId: activeJob.publicId },
      key: `automation:${activeJob.publicId}`,
      timezone: "Asia/Seoul",
      type: "schedule",
    },
  ]);
});

test("rejects an enabled scheduled job without a registered flow before changing schedules", async () => {
  const fixture = createFixture([activeJob], []);

  await assert.rejects(
    fixture.service.reconcile(),
    (error) => error instanceof SchedulerServiceError && error.code === "UNREGISTERED_FLOW_HANDLER",
  );
  assert.deepEqual(fixture.calls, []);
});
