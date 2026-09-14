import { useCallback, useEffect, useState } from "react";
import type {
  ImportBatchDetailResponse,
  ImportBatchListResponse,
  ImportBatchStatus,
  ImportItemStatus,
} from "@bros/contracts";
import { fetchImportBatch, fetchImportBatches, retryImportBatch } from "../api/imports";
import type { ImportDetailLoader, ImportListLoader, ImportRetryAction } from "../api/imports";

type LoadState<T> =
  { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; data: T };
const batchLabels: Record<string, string> = {
  QUEUED: "대기",
  RUNNING: "처리 중",
  SUCCEEDED: "성공",
  PARTIAL_FAILED: "일부 실패",
  FAILED: "실패",
  CANCELLED: "취소",
};
const processingLabels: Record<string, string> = {
  NOT_QUEUED: "미접수",
  QUEUED: "접수됨",
  RUNNING: "Worker 처리 중",
  RETRY_WAIT: "재시도 대기",
  SUCCESS: "Worker 완료",
  FAILED: "Worker 중단",
  UNKNOWN: "상태 확인 필요",
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "Import 정보를 불러오지 못했습니다.";
}
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status-pill status-pill--${value.toLowerCase()}`}>
      {batchLabels[value] ?? value}
    </span>
  );
}

export interface ImportsPageProps {
  loadList?: ImportListLoader;
  loadDetail?: ImportDetailLoader;
  retryBatch?: ImportRetryAction;
}

export function ImportsPage({
  loadList = fetchImportBatches,
  loadDetail = fetchImportBatch,
  retryBatch = retryImportBatch,
}: ImportsPageProps) {
  const [filter, setFilter] = useState<ImportBatchStatus | "">("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [list, setList] = useState<LoadState<ImportBatchListResponse>>({ phase: "loading" });
  const [selected, setSelected] = useState<string>();
  const [itemFilter, setItemFilter] = useState<ImportItemStatus | "">("");
  const [itemCursor, setItemCursor] = useState<string | undefined>();
  const [detail, setDetail] = useState<LoadState<ImportBatchDetailResponse> | undefined>();
  const [action, setAction] = useState<"idle" | "running" | "done">("idle");

  const refreshList = useCallback(async () => {
    setList({ phase: "loading" });
    try {
      setList({
        phase: "ready",
        data: await loadList({
          ...(cursor ? { cursor } : {}),
          ...(filter ? { status: filter } : {}),
        }),
      });
    } catch (error) {
      setList({ phase: "error", message: message(error) });
    }
  }, [cursor, filter, loadList]);

  const refreshDetail = useCallback(async () => {
    if (!selected) return;
    setDetail({ phase: "loading" });
    try {
      setDetail({
        phase: "ready",
        data: await loadDetail(selected, {
          ...(itemCursor ? { itemCursor } : {}),
          ...(itemFilter ? { itemStatus: itemFilter } : {}),
        }),
      });
    } catch (error) {
      setDetail({ phase: "error", message: message(error) });
    }
  }, [itemCursor, itemFilter, loadDetail, selected]);

  useEffect(() => void refreshList(), [refreshList]);
  useEffect(() => void refreshDetail(), [refreshDetail]);

  const choose = (publicId: string) => {
    setSelected(publicId);
    setItemCursor(undefined);
    setItemFilter("");
    setAction("idle");
  };
  const resume = async () => {
    if (!selected) return;
    setAction("running");
    try {
      await retryBatch(selected, "resume");
      setAction("done");
      await Promise.all([refreshDetail(), refreshList()]);
    } catch (error) {
      setAction("idle");
      setDetail({ phase: "error", message: message(error) });
    }
  };

  return (
    <div className="page imports-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">PRODUCT INGESTION</span>
          <h1>Import 관리</h1>
          <p>업무 결과와 Worker 처리 상태를 분리해 확인합니다.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void refreshList()}
          disabled={list.phase === "loading"}
        >
          새로고침
        </button>
      </section>

      <section className="import-panel" aria-labelledby="batch-list-title">
        <div className="panel-toolbar">
          <div>
            <span className="card-kicker">BATCHES</span>
            <h2 id="batch-list-title">수집 Batch</h2>
          </div>
          <label>
            업무 상태
            <select
              aria-label="업무 상태"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as ImportBatchStatus | "");
                setCursor(undefined);
              }}
            >
              <option value="">전체</option>
              {Object.entries(batchLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.phase === "loading" && (
          <p role="status" className="panel-state">
            Batch를 불러오는 중입니다.
          </p>
        )}
        {list.phase === "error" && (
          <div role="alert" className="panel-state panel-state--error">
            <strong>목록을 불러오지 못했습니다.</strong>
            <p>{list.message}</p>
            <button className="secondary-button" onClick={() => void refreshList()}>
              다시 시도
            </button>
          </div>
        )}
        {list.phase === "ready" && list.data.items.length === 0 && (
          <p className="panel-state">조건에 맞는 Batch가 없습니다.</p>
        )}
        {list.phase === "ready" && list.data.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>소스</th>
                    <th>업무 상태</th>
                    <th>처리 상태</th>
                    <th>성공</th>
                    <th>실패</th>
                    <th>검수</th>
                    <th>생성 시각</th>
                    <th>
                      <span className="sr-only">상세</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((batch) => (
                    <tr
                      key={batch.publicId}
                      className={selected === batch.publicId ? "is-selected" : ""}
                    >
                      <td>
                        <strong>{batch.sourceName}</strong>
                        <small>{batch.platformCode}</small>
                      </td>
                      <td>
                        <Status value={batch.status} />
                      </td>
                      <td>{processingLabels[batch.processingStatus]}</td>
                      <td>{batch.counts.success.toLocaleString()}</td>
                      <td>{batch.counts.failed.toLocaleString()}</td>
                      <td>{batch.counts.review.toLocaleString()}</td>
                      <td>{date(batch.createdAt)}</td>
                      <td>
                        <button className="text-button" onClick={() => choose(batch.publicId)}>
                          상세 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.data.nextCursor && (
              <div className="pagination">
                <button
                  className="secondary-button"
                  onClick={() => setCursor(list.data.nextCursor ?? undefined)}
                >
                  다음 Batch
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selected && (
        <section className="import-panel import-detail" aria-labelledby="batch-detail-title">
          <div className="panel-toolbar">
            <div>
              <span className="card-kicker">BATCH DETAIL</span>
              <h2 id="batch-detail-title">Batch 상세</h2>
            </div>
            <button className="text-button" onClick={() => setSelected(undefined)}>
              닫기
            </button>
          </div>
          {detail?.phase === "loading" && (
            <p role="status" className="panel-state">
              상세 결과를 불러오는 중입니다.
            </p>
          )}
          {detail?.phase === "error" && (
            <div role="alert" className="panel-state panel-state--error">
              <strong>상세를 불러오지 못했습니다.</strong>
              <p>{detail.message}</p>
              <button className="secondary-button" onClick={() => void refreshDetail()}>
                다시 시도
              </button>
            </div>
          )}
          {detail?.phase === "ready" && (
            <>
              <div className="batch-metrics">
                <div>
                  <span>업무 상태</span>
                  <Status value={detail.data.batch.status} />
                </div>
                <div>
                  <span>Worker 처리</span>
                  <strong>{processingLabels[detail.data.batch.processingStatus]}</strong>
                </div>
                <div>
                  <span>진행</span>
                  <strong>
                    {detail.data.batch.progress
                      ? `${detail.data.batch.progress.visitedCount.toLocaleString()}건 · ${detail.data.batch.progress.chunks} chunks`
                      : "기록 없음"}
                  </strong>
                </div>
                <div>
                  <span>완료 시각</span>
                  <strong>{date(detail.data.batch.finishedAt)}</strong>
                </div>
              </div>
              {(["FAILED", "RETRY_WAIT", "NOT_QUEUED"] as string[]).includes(
                detail.data.batch.processingStatus,
              ) && (
                <div className="resume-box">
                  <div>
                    <strong>미완료 처리 재개</strong>
                    <p>확정된 성공·실패 이력은 유지하고 끝나지 않은 항목만 처리합니다.</p>
                  </div>
                  <button
                    className="primary-button"
                    disabled={action === "running"}
                    onClick={() => void resume()}
                  >
                    {action === "running" ? "접수 중" : "처리 재개"}
                  </button>
                </div>
              )}
              {action === "done" && (
                <p className="action-notice" role="status">
                  재개 요청을 접수했습니다.
                </p>
              )}
              <div className="item-toolbar">
                <h3>상품 결과</h3>
                <label>
                  상품 상태
                  <select
                    aria-label="상품 상태"
                    value={itemFilter}
                    onChange={(event) => {
                      setItemFilter(event.target.value as ImportItemStatus | "");
                      setItemCursor(undefined);
                    }}
                  >
                    <option value="">전체</option>
                    <option value="SUCCEEDED">성공</option>
                    <option value="FAILED">실패</option>
                    <option value="SKIPPED">스킵</option>
                    <option value="REVIEW_REQUIRED">검수 필요</option>
                    <option value="PENDING">대기</option>
                    <option value="RUNNING">처리 중</option>
                  </select>
                </label>
              </div>
              {detail.data.items.length === 0 ? (
                <p className="panel-state">조건에 맞는 상품 결과가 없습니다.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>행</th>
                        <th>외부 상품 ID</th>
                        <th>상태</th>
                        <th>작업</th>
                        <th>오류 코드</th>
                        <th>오류 원인</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.items.map((item) => (
                        <tr key={item.publicId}>
                          <td>{item.rowNumber}</td>
                          <td>{item.externalProductId ?? "식별자 없음"}</td>
                          <td>
                            <Status value={item.status} />
                          </td>
                          <td>{item.action ?? "—"}</td>
                          <td>
                            <code>{item.errorCode ?? "—"}</code>
                          </td>
                          <td>{item.errorMessage ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {detail.data.nextItemCursor && (
                <div className="pagination">
                  <button
                    className="secondary-button"
                    onClick={() => setItemCursor(detail.data.nextItemCursor ?? undefined)}
                  >
                    다음 상품
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
