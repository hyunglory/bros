import { corePackageName } from "@bros/core";

export { BrowserManagerError, createBrowserManager } from "./browser-manager.js";
export type {
  BrowserConnection,
  BrowserLauncher,
  BrowserLaunchRequest,
  BrowserManager,
} from "./browser-manager.js";

export { createSessionManager, SessionManagerError } from "./session-manager.js";
export type {
  PersistentContextLauncher,
  ProfileSessionRequest,
  ProfileSessionResult,
  SessionManager,
} from "./session-manager.js";
export { createFlowRunner, FlowRunnerError } from "./flow-registry.js";
export type {
  BrowserFlowCleanupContext,
  BrowserFlowContext,
  BrowserFlowHandler,
  BrowserFlowStep,
  FlowRunner,
  FlowRunRequest,
} from "./flow-registry.js";
export {
  BrowserFlowError,
  BrowserRetryPolicyError,
  browserErrorCodes,
  createBrowserErrorMapper,
  createBrowserRetryPolicy,
  mapBrowserError,
} from "./error-taxonomy.js";
export type {
  BrowserErrorCode,
  BrowserErrorMapper,
  BrowserRetryDecision,
  BrowserRetryPolicy,
} from "./error-taxonomy.js";
export {
  createDemoBrowserFlow,
  demoBrowserFlowHandlerKey,
  runDemoBrowserHarness,
} from "./demo-flow.js";
export type {
  DemoArtifactSink,
  DemoFlowArtifact,
  DemoFlowHarnessResult,
  DemoFlowMode,
} from "./demo-flow.js";

export const browserPackageName = "@bros/browser" as const;
export const browserWorkspaceDependencies = [corePackageName] as const;
