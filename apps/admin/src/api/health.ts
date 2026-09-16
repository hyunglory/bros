import { isHealthResponse } from "@bros/contracts";
import type { HealthResponse } from "@bros/contracts";

const HEALTH_TIMEOUT_MS = 3_000;

export type HealthClientErrorKind = "http" | "invalid-response" | "unreachable";

export class HealthClientError extends Error {
  readonly kind: HealthClientErrorKind;
  readonly status: number | undefined;

  constructor(kind: HealthClientErrorKind, message: string, status?: number) {
    super(message);
    this.name = "HealthClientError";
    this.kind = kind;
    this.status = status;
  }
}

export type HealthLoader = () => Promise<HealthResponse>;

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<HealthResponse> {
  const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);

  try {
    const response = await fetcher("/health", {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new HealthClientError(
        "http",
        `API가 상태 코드 ${String(response.status)}로 응답했습니다.`,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HealthClientError("invalid-response", "API 상태 응답 형식이 올바르지 않습니다.");
    }

    if (!isHealthResponse(payload)) {
      throw new HealthClientError("invalid-response", "API 상태 응답 형식이 올바르지 않습니다.");
    }

    return payload;
  } catch (error) {
    if (error instanceof HealthClientError) {
      throw error;
    }

    throw new HealthClientError("unreachable", "API에 연결할 수 없습니다.");
  }
}
