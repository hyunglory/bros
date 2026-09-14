import {
  isBrandReviewDecisionResponse,
  isBrandReviewListResponse,
  isBrandSearchResponse,
} from "@bros/contracts";
import type {
  ApproveBrandReviewRequest,
  BrandReviewDecision,
  BrandReviewDecisionResponse,
  BrandReviewListResponse,
  BrandSearchResponse,
  RejectBrandReviewRequest,
} from "@bros/contracts";

const TIMEOUT_MS = 5_000;

export class BrandReviewClientError extends Error {
  constructor(
    readonly kind: "http" | "invalid-response" | "unreachable",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BrandReviewClientError";
  }
}

function httpMessage(status: number): string {
  if (status === 401) return "관리자 인증이 필요합니다.";
  if (status === 403) return "브랜드 검수를 실행할 권한이 없습니다.";
  if (status === 404) return "브랜드 검수 대상을 찾을 수 없습니다.";
  if (status === 409) return "검수 대상이나 alias가 변경되었습니다. 목록을 새로고침하세요.";
  if (status === 429) return "Import Queue가 가득 찼습니다. 처리 후 다시 시도하세요.";
  if (status === 503) return "브랜드 검수 API가 준비되지 않았습니다.";
  return `브랜드 검수 API가 상태 코드 ${String(status)}로 응답했습니다.`;
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
  check: (value: unknown) => value is T,
  fetcher: typeof fetch,
): Promise<T> {
  try {
    const response = await fetcher(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok)
      throw new BrandReviewClientError("http", httpMessage(response.status), response.status);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BrandReviewClientError(
        "invalid-response",
        "브랜드 검수 API 응답 형식이 올바르지 않습니다.",
      );
    }
    if (!check(payload))
      throw new BrandReviewClientError(
        "invalid-response",
        "브랜드 검수 API 응답 형식이 올바르지 않습니다.",
      );
    return payload;
  } catch (error) {
    if (error instanceof BrandReviewClientError) throw error;
    throw new BrandReviewClientError("unreachable", "브랜드 검수 API에 연결할 수 없습니다.");
  }
}

export interface BrandReviewListOptions {
  cursor?: string;
  limit?: number;
  decision?: BrandReviewDecision;
  platform?: string;
  query?: string;
}

export async function fetchBrandReviews(
  options: BrandReviewListOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<BrandReviewListResponse> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.decision) query.set("decision", options.decision);
  if (options.platform) query.set("platform", options.platform);
  if (options.query) query.set("query", options.query);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson(
    `/api/v1/brand-reviews${suffix}`,
    { headers: { accept: "application/json" } },
    isBrandReviewListResponse,
    fetcher,
  );
}

export async function searchBrands(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<BrandSearchResponse> {
  const params = new URLSearchParams({ limit: "50" });
  if (query.trim()) params.set("query", query.trim());
  return requestJson(
    `/api/v1/brands?${params.toString()}`,
    { headers: { accept: "application/json" } },
    isBrandSearchResponse,
    fetcher,
  );
}

async function decide(
  publicId: string,
  action: "approve" | "reject",
  body: ApproveBrandReviewRequest | RejectBrandReviewRequest,
  fetcher: typeof fetch,
): Promise<BrandReviewDecisionResponse> {
  return requestJson(
    `/api/v1/brand-reviews/${encodeURIComponent(publicId)}/${action}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-bros-operation": `brand-review-${action}`,
      },
      body: JSON.stringify(body),
    },
    isBrandReviewDecisionResponse,
    fetcher,
  );
}

export function approveBrandReview(
  publicId: string,
  input: ApproveBrandReviewRequest,
  fetcher: typeof fetch = fetch,
) {
  return decide(publicId, "approve", input, fetcher);
}

export function rejectBrandReview(
  publicId: string,
  input: RejectBrandReviewRequest,
  fetcher: typeof fetch = fetch,
) {
  return decide(publicId, "reject", input, fetcher);
}

export type BrandReviewListLoader = typeof fetchBrandReviews;
export type BrandSearchLoader = typeof searchBrands;
export type BrandReviewApproveAction = typeof approveBrandReview;
export type BrandReviewRejectAction = typeof rejectBrandReview;
