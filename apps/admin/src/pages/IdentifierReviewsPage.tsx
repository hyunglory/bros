import { useEffect, useRef, useState } from "react";
import type {
  IdentifierReviewDetail,
  IdentifierReviewSummary,
  IdentifierRunDetail,
  IdentifierRunSummary,
  SourceIdentifierType,
} from "@bros/contracts";
import {
  identifierReviewApi,
  createReviewRequestId,
  type IdentifierReviewApi,
} from "../api/identifier-reviews";

const labels: Record<string, string> = {
  CANDIDATE: "검수 대기",
  REVIEW_REQUIRED: "검토 필요",
  AUTO_ACCEPTED: "자동 승인",
  ACCEPTED: "승인",
  REJECTED: "거절",
  QUEUED: "탐색 대기",
  RUNNING: "탐색 중",
  SUCCEEDED: "탐색 완료",
  FAILED: "탐색 실패",
  CANCELLED: "취소",
  NOT_FOUND: "후보 없음",
  CANDIDATES: "후보 있음",
};
const evidenceLabels: Record<string, string> = {
  SOURCE_FIELD: "원본 필드",
  TITLE_MATCH: "상품명 일치",
  URL_MATCH: "주소 일치",
  OPTION_MATCH: "옵션 일치",
  VERIFIED_INTERNAL_IDENTIFIER: "검증된 내부 식별자",
  EXTERNAL_CATALOG: "외부 검색 근거",
};
const types: SourceIdentifierType[] = [
  "MODEL_NO",
  "STYLE_CODE",
  "PRODUCT_NO",
  "MPN",
  "GTIN",
  "EAN",
  "UPC",
  "BARCODE",
  "BRAND_CODE",
];
interface Selection {
  kind: "candidate" | "run";
  id: string;
}
export function IdentifierReviewsPage({
  api = identifierReviewApi,
}: {
  api?: IdentifierReviewApi;
}) {
  const [mode, setMode] = useState<"candidate" | "run">("candidate");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [rows, setRows] = useState<(IdentifierReviewSummary | IdentifierRunSummary)[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(),
    [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<IdentifierReviewDetail | null>(null),
    [run, setRun] = useState<IdentifierRunSummary | IdentifierRunDetail | null>(null);
  const [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const [reason, setReason] = useState(""),
    [value, setValue] = useState(""),
    [type, setType] = useState<SourceIdentifierType>("MODEL_NO");
  const requestIdentity = useRef<{ key: string; id: string } | null>(null);
  const actionLock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const options = { ...(query ? { query } : {}), ...(cursor ? { cursor } : {}), limit: 50 };
    const promise = mode === "candidate" ? api.list(options) : api.runs(options);
    void promise
      .then(
        (data) => {
          if (active) {
            setRows(data.items);
            setNextCursor(data.nextCursor);
          }
        },
        () => {
          if (active) setError("목록을 불러오지 못했습니다. 새로고침하세요.");
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, mode, query, cursor, refresh]);
  useEffect(() => {
    let active = true;
    setDetail(null);
    setRun(null);
    setReason("");
    setValue("");
    if (!selection) return;
    setDetailLoading(true);
    const promise =
      selection.kind === "candidate"
        ? api.detail(selection.id).then((data) => {
            if (active) {
              setDetail(data);
              setRun(data.run);
            }
          })
        : api.run(selection.id).then((data) => {
            if (active) setRun(data);
          });
    void promise
      .catch(() => {
        if (active) setError("상세 정보를 불러오지 못했습니다. 새로고침하세요.");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, selection, refresh]);
  const pending = detail && ["CANDIDATE", "REVIEW_REQUIRED"].includes(detail.decisionStatus);
  async function act(kind: "accept" | "reject" | "manual" | "reresolve") {
    if (actionLock.current || !run) return;
    if ((kind === "reject" || kind === "manual") && !reason.trim()) {
      setError("판단 사유를 입력하세요.");
      return;
    }
    if (kind === "manual" && (!value.trim() || run.productVersion === null)) {
      setError("연결된 상품과 직접입력 품번을 확인하세요.");
      return;
    }
    actionLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    const identityKey = JSON.stringify([
      kind,
      run.publicId,
      run.productVersion,
      type,
      value.trim(),
      reason.trim(),
    ]);
    if (!requestIdentity.current || requestIdentity.current.key !== identityKey)
      requestIdentity.current = { key: identityKey, id: createReviewRequestId() };
    try {
      if (kind === "accept" && detail) await api.accept(detail.publicId, detail.versionNo);
      if (kind === "reject" && detail)
        await api.reject(detail.publicId, detail.versionNo, reason.trim());
      if (kind === "manual" && run.productVersion !== null) {
        const result = await api.manual(run.publicId, {
          requestPublicId: requestIdentity.current.id,
          expectedVersion: run.productVersion,
          identifierType: type,
          candidateValue: value.trim(),
          reason: reason.trim(),
        });
        setSelection({ kind: "candidate", id: result.candidatePublicId });
        setMode("candidate");
      }
      if (kind === "reresolve") {
        const result = await api.reresolve(run.publicId, requestIdentity.current.id);
        setSelection({ kind: "run", id: result.publicId });
        setMode("run");
      }
      requestIdentity.current = null;
      setMessage(
        kind === "reresolve"
          ? "재분석을 접수했습니다. 새로고침하여 처리 상태를 확인하세요."
          : "검수 결정을 기록했습니다.",
      );
      setRefresh((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검수 요청에 실패했습니다.");
    } finally {
      actionLock.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="page identifier-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">IDENTIFIER REVIEW</span>
          <h1>품번 검수</h1>
          <p>후보 근거와 충돌을 확인하고 품번을 승인하거나 직접 입력하세요.</p>
        </div>
        <button
          className="secondary-button"
          disabled={saving || loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          새로고침
        </button>
      </header>
      <section className="import-panel">
        <form
          className="brand-review-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setCursor(undefined);
            setSelection(null);
          }}
        >
          <label>
            조회 대상
            <select
              value={mode}
              disabled={saving}
              onChange={(event) => {
                setMode(event.target.value as typeof mode);
                setCursor(undefined);
                setSelection(null);
              }}
            >
              <option value="candidate">품번 후보</option>
              <option value="run">탐색 이력 · 후보 없음</option>
            </select>
          </label>
          <label>
            상품명·품번 검색
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              disabled={saving}
            />
          </label>
          <button className="primary-button" disabled={saving}>
            검색
          </button>
        </form>
      </section>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="identifier-layout">
        <section className="import-panel" aria-label="품번 검수 목록">
          {loading ? (
            <p role="status">목록을 불러오는 중입니다.</p>
          ) : rows.length === 0 ? (
            <p>검수 대상이 없습니다. 탐색 이력에서 후보 없는 실행도 확인할 수 있습니다.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>상품</th>
                    <th>{mode === "candidate" ? "품번 · 점수" : "후보 수"}</th>
                    <th>상태</th>
                    <th>선택</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.publicId}>
                      <td>
                        {row.productName}
                        <small className="identifier-subtext">
                          {row.brandName ?? "브랜드 미확인"}
                        </small>
                      </td>
                      <td>
                        {"candidateValue" in row
                          ? `${row.candidateValue} · ${row.confidenceScore ?? "미산정"}`
                          : row.candidateCount}
                      </td>
                      <td>{labels["decisionStatus" in row ? row.decisionStatus : row.status]}</td>
                      <td>
                        <button
                          className="secondary-button"
                          disabled={saving}
                          onClick={() => {
                            setError("");
                            setMessage("");
                            setSelection({ kind: mode, id: row.publicId });
                          }}
                        >
                          상세 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            className="secondary-button"
            disabled={loading || saving || !cursor}
            onClick={() => setCursor(undefined)}
          >
            처음
          </button>{" "}
          <button
            className="secondary-button"
            disabled={loading || saving || !nextCursor}
            onClick={() => setCursor(nextCursor ?? undefined)}
          >
            다음
          </button>
        </section>
        <section className="import-panel identifier-detail" aria-label="품번 검수 상세">
          {detailLoading ? (
            <p>상세 정보를 불러오는 중입니다.</p>
          ) : !run ? (
            <p>목록에서 검수 대상을 선택하세요.</p>
          ) : (
            <>
              <h2>{run.productName}</h2>
              <p>
                탐색: {labels[run.status]} ·{" "}
                {run.outcome ? (labels[run.outcome] ?? run.outcome) : "처리 중"}
              </p>
              {run.errorCode && <p role="alert">처리 오류: {run.errorCode}</p>}
              {"providerFailures" in run &&
                run.providerFailures.map((failure, index) => (
                  <p key={index}>검색 제한: {failure.code}</p>
                ))}
              {detail && (
                <>
                  <h3>
                    {detail.candidateValue} <small>{detail.identifierType}</small>
                  </h3>
                  <p>
                    정규화: {detail.candidateNorm} · 점수: {detail.confidenceScore ?? "미산정"} ·{" "}
                    {labels[detail.decisionStatus]}
                  </p>
                  <h3>판단 근거</h3>
                  {detail.evidence.length === 0 ? (
                    <p>수동 입력 또는 별도 근거가 없는 후보입니다.</p>
                  ) : (
                    <ul>
                      {detail.evidence.map((e, index) => (
                        <li key={index}>
                          <strong>{evidenceLabels[e.type] ?? e.type}</strong>{" "}
                          {e.strength === "VERIFIED" ? "(검증됨)" : "(참고)"}
                          {e.matchedText && <p>{e.matchedText}</p>}
                          {e.locator && <small>{e.locator}</small>}
                          {e.sourceUrl && /^https?:\/\//.test(e.sourceUrl) && (
                            <p>
                              <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                                근거 페이지
                              </a>
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <h3>충돌</h3>
                  {detail.conflicts.length ? (
                    <ul>
                      {detail.conflicts.map((conflict, index) => (
                        <li key={index}>{conflict}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>기록된 충돌 없음</p>
                  )}
                  <h3>감사 이력</h3>
                  {detail.audit.map((entry, index) => (
                    <p key={index}>
                      {labels[entry.decision] ?? entry.decision} · {entry.actor} · {entry.decidedAt}
                      {entry.reason && ` · ${entry.reason}`}
                    </p>
                  ))}
                </>
              )}
              <label className="identifier-subtext">
                판단 사유
                <textarea
                  aria-label="판단 사유"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  disabled={saving}
                />
              </label>
              {detail && (
                <div className="identifier-actions">
                  <button
                    className="primary-button"
                    disabled={
                      saving ||
                      !pending ||
                      detail.conflicts.length > 0 ||
                      !run.productPublicId ||
                      run.status !== "SUCCEEDED"
                    }
                    onClick={() => void act("accept")}
                  >
                    후보 승인
                  </button>
                  <button
                    className="secondary-button"
                    disabled={saving || !pending}
                    onClick={() => void act("reject")}
                  >
                    후보 거절
                  </button>
                </div>
              )}
              <h3>품번 직접입력</h3>
              {!run.productPublicId && <p>MASTER 상품에 연결된 뒤 직접입력·승인할 수 있습니다.</p>}
              <label>
                식별자 유형
                <select
                  aria-label="식별자 유형"
                  value={type}
                  onChange={(e) => setType(e.target.value as SourceIdentifierType)}
                  disabled={saving}
                >
                  {types.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                직접입력 품번
                <input
                  aria-label="직접입력 품번"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={512}
                  disabled={saving}
                />
              </label>
              <div className="identifier-actions">
                <button
                  className="primary-button"
                  disabled={saving || !run.productPublicId || run.status !== "SUCCEEDED"}
                  onClick={() => void act("manual")}
                >
                  입력값 검증·승인
                </button>
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void act("reresolve")}
                >
                  다시 탐색
                </button>
              </div>
              {saving && <p role="status">검수 요청을 처리하고 있습니다.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
