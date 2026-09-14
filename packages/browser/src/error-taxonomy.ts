export const browserErrorCodes = [
  "NETWORK_ERROR",
  "NAVIGATION_TIMEOUT",
  "ELEMENT_NOT_FOUND",
  "ELEMENT_NOT_CLICKABLE",
  "LOGIN_REQUIRED",
  "AUTH_FAILED",
  "SESSION_EXPIRED",
  "CAPTCHA_DETECTED",
  "TWO_FACTOR_REQUIRED",
  "PERMISSION_DENIED",
  "SUCCESS_CONDITION_NOT_MET",
  "UNEXPECTED_MODAL",
  "FLOW_LOGIC_ERROR",
  "BROWSER_CRASHED",
  "UNKNOWN_ERROR",
] as const;

export type BrowserErrorCode = (typeof browserErrorCodes)[number];

const retryableCodes = new Set<BrowserErrorCode>([
  "NETWORK_ERROR",
  "NAVIGATION_TIMEOUT",
  "BROWSER_CRASHED",
  "ELEMENT_NOT_FOUND",
]);

const networkErrorNames = new Set(["FetchError", "NetworkError"]);
const browserCrashNames = new Set(["BrowserClosedError", "TargetClosedError"]);
const networkErrorNumbers = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

export interface BrowserErrorMapper {
  map(error: unknown): BrowserErrorCode;
}

export interface BrowserRetryDecision {
  readonly automaticRetry: boolean;
  readonly errorCode: BrowserErrorCode;
  readonly terminalStatus: "FAILED" | "TIMEOUT";
}

export interface BrowserRetryPolicy {
  decide(
    errorCode: BrowserErrorCode,
    context: { attempt: number; retryLimit: number },
  ): BrowserRetryDecision;
}

export class BrowserFlowError extends Error {
  constructor(readonly code: BrowserErrorCode) {
    super("Browser flow failed");
    this.name = "BrowserFlowError";
  }
}

export class BrowserRetryPolicyError extends Error {
  constructor() {
    super("Invalid browser retry context");
    this.name = "BrowserRetryPolicyError";
  }
}

function errorProperty(error: unknown, name: "code" | "name"): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return Reflect.get(error, name);
}

export function mapBrowserError(error: unknown): BrowserErrorCode {
  if (error instanceof BrowserFlowError) return error.code;

  const name = errorProperty(error, "name");
  if (name === "TimeoutError") return "NAVIGATION_TIMEOUT";
  if (typeof name === "string" && networkErrorNames.has(name)) return "NETWORK_ERROR";
  if (typeof name === "string" && browserCrashNames.has(name)) return "BROWSER_CRASHED";

  const code = errorProperty(error, "code");
  if (typeof code === "string" && networkErrorNumbers.has(code)) return "NETWORK_ERROR";
  if (error instanceof Error) return "FLOW_LOGIC_ERROR";
  return "UNKNOWN_ERROR";
}

export function createBrowserErrorMapper(): BrowserErrorMapper {
  return { map: mapBrowserError };
}

function assertRetryContext(context: { attempt: number; retryLimit: number }): void {
  if (
    !Number.isInteger(context.attempt) ||
    context.attempt < 1 ||
    !Number.isInteger(context.retryLimit) ||
    context.retryLimit < 0 ||
    context.retryLimit > 10
  ) {
    throw new BrowserRetryPolicyError();
  }
}

export function createBrowserRetryPolicy(): BrowserRetryPolicy {
  return {
    decide(errorCode, context) {
      assertRetryContext(context);
      return Object.freeze({
        automaticRetry: retryableCodes.has(errorCode) && context.attempt <= context.retryLimit,
        errorCode,
        terminalStatus: errorCode === "NAVIGATION_TIMEOUT" ? "TIMEOUT" : "FAILED",
      });
    },
  };
}
