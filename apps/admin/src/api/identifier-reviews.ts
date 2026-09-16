import {
  isIdentifierReviewList,
  isIdentifierReviewDetail,
  isIdentifierRunList,
  isIdentifierRunDetail,
  isIdentifierReviewDecision,
  isIdentifierReresolveResponse,
  type IdentifierReviewQuery,
  type ManualIdentifierRequest,
} from "@bros/contracts";

export class IdentifierReviewClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  check: (v: unknown) => v is T,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  try {
    const response = await fetcher(`/api/v1/identifier/${path}`, {
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
      headers: {
        accept: "application/json",
        ...(body === undefined
          ? {}
          : { "content-type": "application/json", "x-bros-operation": "identifier-review" }),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: "입력 형식을 확인하세요.",
        401: "관리자 인증이 필요합니다.",
        403: "품번 검수 권한을 확인하세요.",
        404: "검수 대상을 찾을 수 없습니다.",
        409: "이미 결정됐거나 상품·후보가 변경되었습니다. 새로고침 후 근거를 다시 확인하세요.",
        429: "탐색 작업이 가득 찼습니다. 잠시 후 다시 시도하세요.",
        503: "품번 검수 API가 준비되지 않았습니다.",
      };
      throw new IdentifierReviewClientError(
        response.status,
        messages[response.status] ?? "품번 검수 요청에 실패했습니다.",
      );
    }
    const value: unknown = await response.json();
    if (!check(value))
      throw new IdentifierReviewClientError(0, "품번 검수 응답 형식이 올바르지 않습니다.");
    return value;
  } catch (error) {
    if (error instanceof IdentifierReviewClientError) throw error;
    throw new IdentifierReviewClientError(
      0,
      "서버에 연결하지 못했습니다. 같은 요청으로 다시 시도할 수 있습니다.",
    );
  }
}
function params(query: IdentifierReviewQuery) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") result.set(key, String(value));
  return result.toString();
}
export const identifierReviewApi = {
  list: (query: IdentifierReviewQuery) =>
    request(`reviews?${params(query)}`, isIdentifierReviewList),
  runs: (query: IdentifierReviewQuery) => request(`runs?${params(query)}`, isIdentifierRunList),
  detail: (id: string) => request(`candidates/${encodeURIComponent(id)}`, isIdentifierReviewDetail),
  run: (id: string) => request(`runs/${encodeURIComponent(id)}`, isIdentifierRunDetail),
  accept: (id: string, expectedVersion: number) =>
    request(`candidates/${encodeURIComponent(id)}/accept`, isIdentifierReviewDecision, {
      expectedVersion,
    }),
  reject: (id: string, expectedVersion: number, reason: string) =>
    request(`candidates/${encodeURIComponent(id)}/reject`, isIdentifierReviewDecision, {
      expectedVersion,
      reason,
    }),
  manual: (id: string, body: ManualIdentifierRequest) =>
    request(`runs/${encodeURIComponent(id)}/manual`, isIdentifierReviewDecision, body),
  reresolve: (id: string, requestPublicId: string) =>
    request(`runs/${encodeURIComponent(id)}/re-resolve`, isIdentifierReresolveResponse, {
      requestPublicId,
    }),
};
export type IdentifierReviewApi = typeof identifierReviewApi;
/** UUIDv7 request identity; retain it across uncertain responses for the same action. */
export function createReviewRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index--) {
    bytes[index] = Number(timestamp & 255n);
    timestamp >>= 8n;
  }
  bytes[6] = ((bytes[6] ?? 0) & 15) | 112;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
