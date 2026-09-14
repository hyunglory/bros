import type { QueuePort, QueueSchedule } from "./port.js";

const BROWSER_SCHEDULE_KEY_PREFIX = "automation:";

export interface AutomationScheduleJob {
  cronExpression: string | null;
  enabled: boolean;
  handlerKey: string;
  publicId: string;
  timezone: string;
}

export interface AutomationScheduleRepository {
  listBrowserJobs(): Promise<readonly AutomationScheduleJob[]>;
}

export interface RegisteredFlowRegistry {
  registeredHandlerKeys(): readonly string[];
}

export interface SchedulerService {
  reconcile(): Promise<void>;
}

export class SchedulerServiceError extends Error {
  constructor(readonly code: "INVALID_SCHEDULED_JOB" | "UNREGISTERED_FLOW_HANDLER") {
    super(
      code === "INVALID_SCHEDULED_JOB"
        ? "Invalid scheduled browser job"
        : "Scheduled browser flow handler is not registered",
    );
    this.name = "SchedulerServiceError";
  }
}

function scheduleKey(publicId: string): string {
  return `${BROWSER_SCHEDULE_KEY_PREFIX}${publicId}`;
}

function assertScheduledJob(job: AutomationScheduleJob, registered: ReadonlySet<string>): void {
  if (
    job.cronExpression === null ||
    job.cronExpression.trim() === "" ||
    job.publicId.trim() === "" ||
    job.timezone.trim() === ""
  ) {
    throw new SchedulerServiceError("INVALID_SCHEDULED_JOB");
  }
  if (!registered.has(job.handlerKey)) {
    throw new SchedulerServiceError("UNREGISTERED_FLOW_HANDLER");
  }
}

function asSchedule(job: AutomationScheduleJob): QueueSchedule {
  if (job.cronExpression === null) throw new SchedulerServiceError("INVALID_SCHEDULED_JOB");
  return {
    cron: job.cronExpression,
    data: { publicId: job.publicId },
    key: scheduleKey(job.publicId),
    timezone: job.timezone,
  };
}

export function createSchedulerService(options: {
  flowRegistry: RegisteredFlowRegistry;
  queue: Pick<QueuePort, "getSchedules" | "schedule" | "unschedule">;
  repository: AutomationScheduleRepository;
}): SchedulerService {
  let reconciling: Promise<void> | undefined;

  const reconcile = async (): Promise<void> => {
    const jobs = await options.repository.listBrowserJobs();
    const registered = new Set(options.flowRegistry.registeredHandlerKeys());
    const desired = new Map<string, QueueSchedule>();
    for (const job of jobs) {
      if (!job.enabled || job.cronExpression === null) continue;
      assertScheduledJob(job, registered);
      const schedule = asSchedule(job);
      if (desired.has(schedule.key)) throw new SchedulerServiceError("INVALID_SCHEDULED_JOB");
      desired.set(schedule.key, schedule);
    }

    const existing = await options.queue.getSchedules("browser.run");
    for (const schedule of existing) {
      if (schedule.key.startsWith(BROWSER_SCHEDULE_KEY_PREFIX) && !desired.has(schedule.key)) {
        await options.queue.unschedule("browser.run", schedule.key);
      }
    }
    for (const schedule of desired.values()) {
      await options.queue.schedule("browser.run", schedule);
    }
  };

  return {
    reconcile: () => {
      reconciling ??= reconcile().finally(() => {
        reconciling = undefined;
      });
      return reconciling;
    },
  };
}
