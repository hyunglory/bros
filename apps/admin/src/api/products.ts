import {
  isProductMasterDetailResponse,
  isProductMasterListResponse,
  isProductMasterSummary,
} from "@bros/contracts";
import type {
  ProductIdentifierStatus,
  ProductMasterDetailResponse,
  ProductMasterListResponse,
  ProductMasterStatus,
  ProductMasterSummary,
  ProductMasterUpdateRequest,
} from "@bros/contracts";

const TIMEOUT_MS = 5_000;

export class ProductClientError extends Error {
  constructor(
    readonly kind: "http" | "invalid-response" | "unreachable",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProductClientError";
  }
}

function safeHttpMessage(status: number): string {
  if (status === 401) return "관리자 인증이 필요합니다.";
  if (status === 403) return "이 작업을 실행할 권한이 없습니다.";
  if (status === 404) return "MASTER 상품을 찾을 수 없습니다.";
  if (status === 409) return "다른 작업자가 먼저 수정했습니다. 최신 정보를 다시 확인하세요.";
  if (status === 503) return "MASTER 상품 API가 준비되지 않았습니다.";
  return `MASTER 상품 API가 상태 코드 ${String(status)}로 응답했습니다.`;
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
      throw new ProductClientError("http", safeHttpMessage(response.status), response.status);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProductClientError(
        "invalid-response",
        "MASTER 상품 API 응답 형식이 올바르지 않습니다.",
      );
    }
    if (!check(payload))
      throw new ProductClientError(
        "invalid-response",
        "MASTER 상품 API 응답 형식이 올바르지 않습니다.",
      );
    return payload;
  } catch (error) {
    if (error instanceof ProductClientError) throw error;
    throw new ProductClientError("unreachable", "MASTER 상품 API에 연결할 수 없습니다.");
  }
}

export interface ProductListOptions {
  cursor?: string;
  limit?: number;
  status?: ProductMasterStatus;
  identifierStatus?: ProductIdentifierStatus;
  brand?: string;
  source?: string;
  query?: string;
}

export async function fetchProducts(
  options: ProductListOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<ProductMasterListResponse> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.status) query.set("status", options.status);
  if (options.identifierStatus) query.set("identifierStatus", options.identifierStatus);
  if (options.brand) query.set("brand", options.brand);
  if (options.source) query.set("source", options.source);
  if (options.query) query.set("query", options.query);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson(
    `/api/v1/products${suffix}`,
    { headers: { accept: "application/json" } },
    isProductMasterListResponse,
    fetcher,
  );
}

export async function fetchProduct(
  publicId: string,
  fetcher: typeof fetch = fetch,
): Promise<ProductMasterDetailResponse> {
  return requestJson(
    `/api/v1/products/${encodeURIComponent(publicId)}`,
    { headers: { accept: "application/json" } },
    isProductMasterDetailResponse,
    fetcher,
  );
}

export async function updateProduct(
  publicId: string,
  input: ProductMasterUpdateRequest,
  fetcher: typeof fetch = fetch,
): Promise<ProductMasterSummary> {
  return requestJson(
    `/api/v1/products/${encodeURIComponent(publicId)}`,
    {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-bros-operation": "product-update",
      },
      body: JSON.stringify(input),
    },
    isProductMasterSummary,
    fetcher,
  );
}

export type ProductListLoader = typeof fetchProducts;
export type ProductDetailLoader = typeof fetchProduct;
export type ProductUpdateAction = typeof updateProduct;
