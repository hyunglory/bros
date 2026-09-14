import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  BrandAliasScope,
  BrandReviewDecision,
  BrandReviewListResponse,
  BrandSummary,
} from "@bros/contracts";
import {
  approveBrandReview,
  fetchBrandReviews,
  rejectBrandReview,
  searchBrands,
} from "../api/brand-reviews";
import type {
  BrandReviewApproveAction,
  BrandReviewListLoader,
  BrandReviewRejectAction,
  BrandSearchLoader,
} from "../api/brand-reviews";

type LoadState<T> =
  { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; data: T };

const decisionLabels: Record<BrandReviewDecision, string> = {
  PENDING: "미결",
  APPROVED: "승인",
  REJECTED: "거절",
};

export function BrandReviewsPage({
  loadList = fetchBrandReviews,
  loadBrands = searchBrands,
  approve = approveBrandReview,
  reject = rejectBrandReview,
}: {
  loadList?: BrandReviewListLoader;
  loadBrands?: BrandSearchLoader;
  approve?: BrandReviewApproveAction;
  reject?: BrandReviewRejectAction;
}) {
  const [filters, setFilters] = useState({
    decision: "PENDING" as BrandReviewDecision,
    platform: "",
    query: "",
  });
  const [draft, setDraft] = useState(filters);
  const [list, setList] = useState<LoadState<BrandReviewListResponse>>({ phase: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brands, setBrands] = useState<LoadState<BrandSummary[]>>({ phase: "loading" });
  const [brandQuery, setBrandQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [scope, setScope] = useState<BrandAliasScope>("PLATFORM");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<{
    phase: "idle" | "saving" | "error" | "done";
    message?: string;
  }>({ phase: "idle" });

  const selected = useMemo(
    () =>
      list.phase === "ready"
        ? list.data.items.find((item) => item.publicId === selectedId)
        : undefined,
    [list, selectedId],
  );

  const refresh = useCallback(
    async (cursor?: string) => {
      setList({ phase: "loading" });
      try {
        setList({
          phase: "ready",
          data: await loadList({ ...filters, ...(cursor ? { cursor } : {}), limit: 50 }),
        });
      } catch (error) {
        setList({
          phase: "error",
          message: error instanceof Error ? error.message : "목록을 불러오지 못했습니다.",
        });
      }
    },
    [filters, loadList],
  );

  const refreshBrands = useCallback(async () => {
    setBrands({ phase: "loading" });
    try {
      setBrands({ phase: "ready", data: (await loadBrands(brandQuery)).items });
    } catch (error) {
      setBrands({
        phase: "error",
        message: error instanceof Error ? error.message : "브랜드를 불러오지 못했습니다.",
      });
    }
  }, [brandQuery, loadBrands]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    void refreshBrands();
  }, [refreshBrands]);

  function search(event: FormEvent) {
    event.preventDefault();
    setSelectedId(null);
    setFilters(draft);
  }

  async function decide(kind: "approve" | "reject") {
    if (!selected || !reason.trim() || (kind === "approve" && !brandId)) {
      setAction({ phase: "error", message: "대상 브랜드와 변경 사유를 입력하세요." });
      return;
    }
    setAction({ phase: "saving" });
    try {
      const result =
        kind === "approve"
          ? await approve(selected.publicId, {
              expectedVersion: selected.version,
              brandPublicId: brandId,
              scope,
              changeReason: reason.trim(),
            })
          : await reject(selected.publicId, {
              expectedVersion: selected.version,
              changeReason: reason.trim(),
            });
      setAction({
        phase: "done",
        message: result.reprocessBatchPublicId
          ? `승인했습니다. 재처리 batch: ${result.reprocessBatchPublicId}`
          : "거절 결정을 기록했습니다.",
      });
      setSelectedId(null);
      setReason("");
      setBrandId("");
      await refresh();
    } catch (error) {
      setAction({
        phase: "error",
        message: error instanceof Error ? error.message : "결정을 저장하지 못했습니다.",
      });
      if (error && typeof error === "object" && "status" in error && error.status === 409)
        await refresh();
    }
  }

  return (
    <div className="page brand-review-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">BRAND GOVERNANCE</span>
          <h1>미해결 브랜드 검수</h1>
          <p>자동 매칭하지 못한 원본 브랜드를 기존 브랜드 alias로 승인하거나 거절합니다.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void refresh()}
          disabled={list.phase === "loading"}
        >
          새로고침
        </button>
      </header>

      <section className="import-panel product-filter-panel">
        <form className="brand-review-filters" onSubmit={search} aria-label="브랜드 검수 검색">
          <label>
            상품·브랜드 검색
            <input
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            플랫폼
            <input
              value={draft.platform}
              onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            결정
            <select
              value={draft.decision}
              onChange={(e) =>
                setDraft({ ...draft, decision: e.target.value as BrandReviewDecision })
              }
            >
              {Object.entries(decisionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="submit">
            검색
          </button>
        </form>
      </section>

      <section className="import-panel" aria-labelledby="brand-review-list-title">
        <div className="panel-toolbar">
          <div>
            <span className="card-kicker">UNRESOLVED ALIAS</span>
            <h2 id="brand-review-list-title">검수 대상</h2>
          </div>
        </div>
        {list.phase === "loading" && (
          <p role="status" className="panel-state">
            검수 대상을 불러오는 중입니다.
          </p>
        )}
        {list.phase === "error" && (
          <div role="alert" className="panel-state panel-state--error">
            <strong>목록을 불러오지 못했습니다.</strong>
            <p>{list.message}</p>
          </div>
        )}
        {list.phase === "ready" && list.data.items.length === 0 && (
          <p className="panel-state">조건에 맞는 검수 대상이 없습니다.</p>
        )}
        {list.phase === "ready" && list.data.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>원본 상품</th>
                    <th>플랫폼</th>
                    <th>원본 브랜드</th>
                    <th>사유</th>
                    <th>결정</th>
                    <th>
                      <span className="sr-only">선택</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((item) => (
                    <tr
                      key={item.publicId}
                      className={selectedId === item.publicId ? "is-selected" : ""}
                    >
                      <td>
                        <strong>{item.productName}</strong>
                        <small>
                          {item.externalProductId} · {item.sourceProductPublicId}
                        </small>
                      </td>
                      <td>
                        {item.platform.name}
                        <small>{item.platform.code}</small>
                      </td>
                      <td>
                        <strong>{item.rawBrandName}</strong>
                        <small>{item.normalizedName}</small>
                      </td>
                      <td>
                        {item.unresolvedReason}
                        <small>{item.matchReason ?? "명시된 상세 사유 없음"}</small>
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${item.decision.toLowerCase()}`}>
                          {decisionLabels[item.decision]}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelectedId(item.publicId);
                            setAction({ phase: "idle" });
                          }}
                          disabled={item.decision !== "PENDING"}
                        >
                          검수
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
                  onClick={() => void refresh(list.data.nextCursor ?? undefined)}
                >
                  다음 50건
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {!selected && action.message && (
        <p
          role={action.phase === "error" ? "alert" : "status"}
          className={
            action.phase === "error" ? "action-notice form-message--error" : "action-notice"
          }
        >
          {action.message}
        </p>
      )}

      {selected && (
        <section
          className="import-panel brand-decision-panel"
          aria-labelledby="brand-decision-title"
        >
          <div className="panel-toolbar">
            <div>
              <span className="card-kicker">HUMAN DECISION</span>
              <h2 id="brand-decision-title">{selected.rawBrandName} 검수</h2>
            </div>
          </div>
          <div className="brand-decision-grid">
            <div className="brand-search-box">
              <label>
                기존 브랜드 검색
                <input
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                  maxLength={100}
                />
              </label>
              {brands.phase === "loading" && <p>브랜드를 불러오는 중입니다.</p>}
              {brands.phase === "error" && (
                <p role="alert" className="form-message--error">
                  {brands.message}
                </p>
              )}
              {brands.phase === "ready" && (
                <label>
                  연결 브랜드
                  <select
                    aria-label="연결 브랜드"
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                  >
                    <option value="">선택하세요</option>
                    {brands.data.map((brand) => (
                      <option key={brand.publicId} value={brand.publicId}>
                        {brand.nameKo ?? brand.nameEn ?? brand.key} ({brand.key})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label>
              Alias 범위
              <select value={scope} onChange={(e) => setScope(e.target.value as BrandAliasScope)}>
                <option value="PLATFORM">현재 플랫폼</option>
                <option value="GLOBAL">전체 플랫폼</option>
              </select>
            </label>
            <label className="reason-field">
              변경 사유
              <textarea
                aria-label="변경 사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </label>
            <div className="form-actions">
              <span
                role={action.phase === "error" ? "alert" : "status"}
                className={
                  action.phase === "error" ? "form-message form-message--error" : "form-message"
                }
              >
                {action.message}
              </span>
              <div>
                <button
                  className="secondary-button"
                  onClick={() => void decide("reject")}
                  disabled={action.phase === "saving"}
                >
                  거절
                </button>{" "}
                <button
                  className="primary-button"
                  onClick={() => void decide("approve")}
                  disabled={action.phase === "saving"}
                >
                  Alias 승인 및 재처리
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
