import {
  isImportBatchDetailResponse,
  isImportBatchListResponse,
  isImportRetryResponse,
} from "@bros/contracts";
import type {
  ImportBatchDetailResponse,
  ImportBatchListResponse,
  ImportBatchStatus,
  ImportItemStatus,
  ImportRetryAccepted,
  ImportRetryReplay,
} from "@bros/contracts";

const TIMEOUT_MS = 5_000;
export class ImportClientError extends Error {
  constructor(
    readonly kind: "http" | "invalid-response" | "unreachable",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ImportClientError";
  }
}

function safeHttpMessage(status: number): string {
  if (status === 401) return "관리자 인증이 필요합니다.";
  if (status === 403) return "이 작업을 실행할 권한이 없습니다.";
  if (status === 429) return "처리 대기 한도를 초과했습니다. 잠시 후 다시 시도하세요.";
  if (status === 503) return "Import API가 준비되지 않았습니다.";
  if (status === 404) return "Import Batch를 찾을 수 없습니다.";
  if (status === 409) return "현재 상태에서는 이 작업을 실행할 수 없습니다.";
  return `Import API가 상태 코드 ${String(status)}로 응답했습니다.`;
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
      throw new ImportClientError("http", safeHttpMessage(response.status), response.status);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ImportClientError("invalid-response", "Import API 응답 형식이 올바르지 않습니다.");
    }
    if (!check(payload))
      throw new ImportClientError("invalid-response", "Import API 응답 형식이 올바르지 않습니다.");
    return payload;
  } catch (error) {
    if (error instanceof ImportClientError) throw error;
    throw new ImportClientError("unreachable", "Import API에 연결할 수 없습니다.");
  }
}

export async function fetchImportBatches(
  options: { cursor?: string; limit?: number; status?: ImportBatchStatus } = {},
  fetcher: typeof fetch = fetch,
): Promise<ImportBatchListResponse> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.status) query.set("status", options.status);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson(
    `/api/v1/import-batches${suffix}`,
    { headers: { accept: "application/json" } },
    isImportBatchListResponse,
    fetcher,
  );
}

export async function fetchImportBatch(
  publicId: string,
  options: { itemCursor?: string; itemLimit?: number; itemStatus?: ImportItemStatus } = {},
  fetcher: typeof fetch = fetch,
): Promise<ImportBatchDetailResponse> {
  const query = new URLSearchParams();
  if (options.itemCursor) query.set("itemCursor", options.itemCursor);
  if (options.itemLimit) query.set("itemLimit", String(options.itemLimit));
  if (options.itemStatus) query.set("itemStatus", options.itemStatus);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson(
    `/api/v1/import-batches/${encodeURIComponent(publicId)}${suffix}`,
    { headers: { accept: "application/json" } },
    isImportBatchDetailResponse,
    fetcher,
  );
}

export async function retryImportBatch(
  publicId: string,
  mode: "replay" | "resume" = "resume",
  fetcher: typeof fetch = fetch,
): Promise<ImportRetryAccepted | ImportRetryReplay> {
  return requestJson(
    `/api/v1/import-batches/${encodeURIComponent(publicId)}/retry`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-bros-operation": "import-retry",
      },
      body: JSON.stringify({ mode }),
    },
    isImportRetryResponse,
    fetcher,
  );
}

export type ImportListLoader = typeof fetchImportBatches;
export type ImportDetailLoader = typeof fetchImportBatch;
export type ImportRetryAction = typeof retryImportBatch;
