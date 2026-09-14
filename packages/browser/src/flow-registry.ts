export type BrowserFlowStep = "prepare" | "authenticate" | "execute" | "verify";

export interface BrowserFlowContext {
  readonly handlerKey: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly runPublicId: string;
  readonly signal?: AbortSignal;
}

export interface BrowserFlowCleanupContext extends BrowserFlowContext {
  readonly outcome: "FAILED" | "SUCCEEDED";
}

export interface BrowserFlowHandler {
  readonly handlerKey: string;
  prepare(context: BrowserFlowContext): Promise<void>;
  authenticate(context: BrowserFlowContext): Promise<void>;
  execute(context: BrowserFlowContext): Promise<void>;
  verify(context: BrowserFlowContext): Promise<void>;
  cleanup(context: BrowserFlowCleanupContext): Promise<void>;
}

export interface FlowRunRequest {
  readonly handlerKey: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly runPublicId: string;
  readonly signal?: AbortSignal;
}

export interface FlowRunner {
  registeredHandlerKeys(): readonly string[];
  run(request: FlowRunRequest): Promise<void>;
}

export class FlowRunnerError extends Error {
  constructor(
    readonly code:
      | "DUPLICATE_FLOW_HANDLER"
      | "FLOW_CLEANUP_FAILED"
      | "FLOW_EXECUTION_FAILED"
      | "FLOW_NOT_REGISTERED"
      | "INVALID_FLOW_HANDLER"
      | "INVALID_FLOW_HANDLER_KEY"
      | "INVALID_FLOW_RUN_REQUEST",
  ) {
    super(
      code === "DUPLICATE_FLOW_HANDLER"
        ? "Duplicate browser flow handler"
        : code === "FLOW_CLEANUP_FAILED"
          ? "Browser flow cleanup failed"
          : code === "FLOW_EXECUTION_FAILED"
            ? "Browser flow execution failed"
            : code === "FLOW_NOT_REGISTERED"
              ? "Browser flow handler is not registered"
              : code === "INVALID_FLOW_HANDLER"
                ? "Invalid browser flow handler"
                : code === "INVALID_FLOW_HANDLER_KEY"
                  ? "Invalid browser flow handler key"
                  : "Invalid browser flow run request",
    );
    this.name = "FlowRunnerError";
  }
}

const HANDLER_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const LIFECYCLE_STEPS: readonly BrowserFlowStep[] = [
  "prepare",
  "authenticate",
  "execute",
  "verify",
];

function assertHandlerKey(handlerKey: string): void {
  if (!HANDLER_KEY_PATTERN.test(handlerKey)) {
    throw new FlowRunnerError("INVALID_FLOW_HANDLER_KEY");
  }
}

function assertRunRequest(request: FlowRunRequest): void {
  assertHandlerKey(request.handlerKey);
  if (request.runPublicId.trim() === "") {
    throw new FlowRunnerError("INVALID_FLOW_RUN_REQUEST");
  }
}

function assertHandler(handler: BrowserFlowHandler): void {
  assertHandlerKey(handler.handlerKey);
  for (const step of [...LIFECYCLE_STEPS, "cleanup"] as const) {
    if (typeof handler[step] !== "function") {
      throw new FlowRunnerError("INVALID_FLOW_HANDLER");
    }
  }
}

function createContext(request: FlowRunRequest): BrowserFlowContext {
  return Object.freeze({
    handlerKey: request.handlerKey,
    input: Object.freeze({ ...(request.input ?? {}) }),
    runPublicId: request.runPublicId,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new FlowRunnerError("FLOW_EXECUTION_FAILED");
}

export function createFlowRunner(handlers: readonly BrowserFlowHandler[]): FlowRunner {
  const registered = new Map<string, BrowserFlowHandler>();
  for (const handler of handlers) {
    assertHandler(handler);
    if (registered.has(handler.handlerKey)) {
      throw new FlowRunnerError("DUPLICATE_FLOW_HANDLER");
    }
    registered.set(handler.handlerKey, handler);
  }

  return {
    registeredHandlerKeys: () => [...registered.keys()].sort(),
    run: async (request: FlowRunRequest): Promise<void> => {
      assertRunRequest(request);
      const handler = registered.get(request.handlerKey);
      if (handler === undefined) throw new FlowRunnerError("FLOW_NOT_REGISTERED");

      const context = createContext(request);
      let lifecycleFailed = false;
      let cleanupFailed = false;
      let started = false;
      try {
        for (const step of LIFECYCLE_STEPS) {
          throwIfAborted(context.signal);
          started = true;
          await handler[step](context);
        }
      } catch {
        lifecycleFailed = true;
      } finally {
        if (started) {
          try {
            await handler.cleanup({
              ...context,
              outcome: lifecycleFailed ? "FAILED" : "SUCCEEDED",
            });
          } catch {
            cleanupFailed = true;
          }
        }
      }
      if (lifecycleFailed) throw new FlowRunnerError("FLOW_EXECUTION_FAILED");
      if (cleanupFailed) throw new FlowRunnerError("FLOW_CLEANUP_FAILED");
    },
  };
}
