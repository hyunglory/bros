import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  ProductIdentifierStatus,
  ProductMasterDetailResponse,
  ProductMasterListResponse,
  ProductMasterStatus,
} from "@bros/contracts";
import { ProductClientError, fetchProduct, fetchProducts, updateProduct } from "../api/products";
import type {
  ProductDetailLoader,
  ProductListLoader,
  ProductListOptions,
  ProductUpdateAction,
} from "../api/products";

type LoadState<T> =
  { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; data: T };

const statusLabels: Record<ProductMasterStatus, string> = {
  ACTIVE: "활성",
  INACTIVE: "비활성",
  REVIEW_REQUIRED: "검수 필요",
};
const identifierLabels: Record<ProductIdentifierStatus, string> = {
  UNKNOWN: "확인 전",
  SEARCHING: "탐색 중",
  CANDIDATE: "후보 있음",
  REVIEW_REQUIRED: "검수 필요",
  VERIFIED: "검증됨",
  NOT_FOUND: "찾지 못함",
  NOT_APPLICABLE: "대상 아님",
};

function date(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`status-pill status-pill--${value.toLowerCase()}`}>
      {statusLabels[value as ProductMasterStatus] ?? value}
    </span>
  );
}

interface ProductFilters {
  query: string;
  brand: string;
  source: string;
  status: ProductMasterStatus | "";
  identifierStatus: ProductIdentifierStatus | "";
}

const emptyFilters: ProductFilters = {
  query: "",
  brand: "",
  source: "",
  status: "",
  identifierStatus: "",
};

export function ProductsPage({
  listLoader = fetchProducts,
  detailLoader = fetchProduct,
  updateAction = updateProduct,
}: {
  listLoader?: ProductListLoader;
  detailLoader?: ProductDetailLoader;
  updateAction?: ProductUpdateAction;
}) {
  const [draft, setDraft] = useState<ProductFilters>(emptyFilters);
  const [filters, setFilters] = useState<ProductFilters>(emptyFilters);
  const [cursor, setCursor] = useState<string>();
  const [list, setList] = useState<LoadState<ProductMasterListResponse>>({ phase: "loading" });
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<LoadState<ProductMasterDetailResponse>>();
  const [edit, setEdit] = useState({
    productName: "",
    categoryKey: "",
    productType: "",
    status: "REVIEW_REQUIRED" as ProductMasterStatus,
    changeReason: "",
  });
  const [action, setAction] = useState<{
    phase: "idle" | "saving" | "done" | "error";
    message?: string;
  }>({ phase: "idle" });

  const listOptions = useCallback(
    (): ProductListOptions => ({
      ...(cursor ? { cursor } : {}),
      limit: 25,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.identifierStatus ? { identifierStatus: filters.identifierStatus } : {}),
      ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
      ...(filters.brand.trim() ? { brand: filters.brand.trim() } : {}),
      ...(filters.source.trim() ? { source: filters.source.trim() } : {}),
    }),
    [cursor, filters],
  );

  const refreshList = useCallback(async () => {
    setList({ phase: "loading" });
    try {
      setList({ phase: "ready", data: await listLoader(listOptions()) });
    } catch (error) {
      setList({
        phase: "error",
        message: error instanceof Error ? error.message : "목록을 불러오지 못했습니다.",
      });
    }
  }, [listLoader, listOptions]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const refreshDetail = useCallback(async () => {
    if (!selected) return;
    setDetail({ phase: "loading" });
    try {
      const data = await detailLoader(selected);
      setDetail({ phase: "ready", data });
      setEdit({
        productName: data.master.productName,
        categoryKey: data.master.categoryKey,
        productType: data.master.productType,
        status: data.master.status,
        changeReason: "",
      });
    } catch (error) {
      setDetail({
        phase: "error",
        message: error instanceof Error ? error.message : "상세를 불러오지 못했습니다.",
      });
    }
  }, [detailLoader, selected]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  function search(event: FormEvent) {
    event.preventDefault();
    setCursor(undefined);
    setFilters(draft);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || detail?.phase !== "ready") return;
    setAction({ phase: "saving" });
    try {
      await updateAction(selected, {
        expectedVersion: detail.data.master.version,
        changeReason: edit.changeReason,
        productName: edit.productName,
        categoryKey: edit.categoryKey,
        productType: edit.productType,
        status: edit.status,
      });
      await Promise.all([refreshDetail(), refreshList()]);
      setAction({ phase: "done", message: "MASTER 기본 정보를 저장했습니다." });
    } catch (error) {
      if (error instanceof ProductClientError && error.status === 409) await refreshDetail();
      setAction({
        phase: "error",
        message: error instanceof Error ? error.message : "저장하지 못했습니다.",
      });
    }
  }

  return (
    <div className="page product-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CATALOG CONTROL</span>
          <h1>MASTER 상품관리</h1>
          <p>표준 상품과 Source·SKU·Identifier·이미지 연결을 한곳에서 검토합니다.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void refreshList()}
          disabled={list.phase === "loading"}
        >
          새로고침
        </button>
      </header>

      <section className="import-panel product-filter-panel" aria-labelledby="product-filter-title">
        <form className="product-filters" onSubmit={search}>
          <h2 id="product-filter-title" className="sr-only">
            MASTER 검색
          </h2>
          <label>
            상품명·품번
            <input
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            브랜드
            <input
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            Source
            <input
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            MASTER 상태
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as ProductMasterStatus | "" })
              }
            >
              <option value="">전체</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Identifier 상태
            <select
              value={draft.identifierStatus}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  identifierStatus: e.target.value as ProductIdentifierStatus | "",
                })
              }
            >
              <option value="">전체</option>
              {Object.entries(identifierLabels).map(([value, label]) => (
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

      <section className="import-panel" aria-labelledby="product-list-title">
        <div className="panel-toolbar">
          <div>
            <span className="card-kicker">PRODUCT MASTER</span>
            <h2 id="product-list-title">표준 상품</h2>
          </div>
        </div>
        {list.phase === "loading" && (
          <p role="status" className="panel-state">
            MASTER 상품을 불러오는 중입니다.
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
          <p className="panel-state">조건에 맞는 MASTER 상품이 없습니다.</p>
        )}
        {list.phase === "ready" && list.data.items.length > 0 && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>상품</th>
                    <th>브랜드</th>
                    <th>상태</th>
                    <th>Identifier</th>
                    <th>연결</th>
                    <th>수정 시각</th>
                    <th>
                      <span className="sr-only">상세</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((product) => (
                    <tr
                      key={product.publicId}
                      className={selected === product.publicId ? "is-selected" : ""}
                    >
                      <td>
                        <strong>{product.productName}</strong>
                        <small>{product.publicId}</small>
                      </td>
                      <td>
                        {product.brand?.nameKo ??
                          product.brand?.nameEn ??
                          product.brand?.key ??
                          "미연결"}
                      </td>
                      <td>
                        <Status value={product.status} />
                      </td>
                      <td>{identifierLabels[product.identifierStatus]}</td>
                      <td>
                        <small>
                          Source {product.counts.sources} · SKU {product.counts.skus}
                        </small>
                        <small>
                          품번 {product.counts.identifiers} · 이미지 {product.counts.sourceImages}
                        </small>
                      </td>
                      <td>{date(product.updatedAt)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(product.publicId);
                            setAction({ phase: "idle" });
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
            {list.data.nextCursor && (
              <div className="pagination">
                <button
                  className="secondary-button"
                  onClick={() => setCursor(list.data.nextCursor ?? undefined)}
                >
                  다음 상품
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selected && (
        <section className="import-panel product-detail" aria-labelledby="product-detail-title">
          <div className="panel-toolbar">
            <div>
              <span className="card-kicker">MASTER DETAIL</span>
              <h2 id="product-detail-title">상품 상세</h2>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setSelected(undefined);
                setDetail(undefined);
              }}
            >
              닫기
            </button>
          </div>
          {detail?.phase === "loading" && (
            <p role="status" className="panel-state">
              연결 정보를 불러오는 중입니다.
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
              <div className="product-summary">
                <div>
                  <span>공개 ID</span>
                  <code>{detail.data.master.publicId}</code>
                </div>
                <div>
                  <span>브랜드</span>
                  <strong>
                    {detail.data.master.brand?.nameKo ??
                      detail.data.master.brand?.nameEn ??
                      "미연결"}
                  </strong>
                </div>
                <div>
                  <span>Identifier 상태</span>
                  <strong>{identifierLabels[detail.data.master.identifierStatus]}</strong>
                </div>
                <div>
                  <span>버전</span>
                  <strong>v{detail.data.master.version}</strong>
                </div>
              </div>
              <form className="product-edit-form" onSubmit={(event) => void save(event)}>
                <div className="form-heading">
                  <div>
                    <h3>기본 정보 수정</h3>
                    <p>브랜드와 Identifier 연결은 전용 검수 흐름에서 변경합니다.</p>
                  </div>
                  <Status value={detail.data.master.status} />
                </div>
                <div className="edit-grid">
                  <label>
                    상품명
                    <input
                      required
                      maxLength={500}
                      value={edit.productName}
                      onChange={(e) => setEdit({ ...edit, productName: e.target.value })}
                    />
                  </label>
                  <label>
                    카테고리
                    <input
                      required
                      maxLength={64}
                      value={edit.categoryKey}
                      onChange={(e) => setEdit({ ...edit, categoryKey: e.target.value })}
                    />
                  </label>
                  <label>
                    상품 유형
                    <input
                      required
                      maxLength={64}
                      value={edit.productType}
                      onChange={(e) => setEdit({ ...edit, productType: e.target.value })}
                    />
                  </label>
                  <label>
                    MASTER 상태
                    <select
                      value={edit.status}
                      onChange={(e) =>
                        setEdit({ ...edit, status: e.target.value as ProductMasterStatus })
                      }
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="reason-field">
                  변경 사유
                  <textarea
                    required
                    maxLength={500}
                    rows={2}
                    value={edit.changeReason}
                    onChange={(e) => setEdit({ ...edit, changeReason: e.target.value })}
                  />
                </label>
                <div className="form-actions">
                  <span
                    className={
                      action.phase === "error" ? "form-message form-message--error" : "form-message"
                    }
                    role="status"
                  >
                    {action.message}
                  </span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={action.phase === "saving"}
                  >
                    {action.phase === "saving" ? "저장 중" : "기본 정보 저장"}
                  </button>
                </div>
              </form>
              <RelationSection title="표준 SKU" empty="연결된 표준 SKU가 없습니다.">
                {detail.data.skus.length > 0 && (
                  <div className="relation-grid">
                    {detail.data.skus.map((sku) => (
                      <article key={sku.publicId}>
                        <strong>{sku.skuName}</strong>
                        <code>{sku.publicId}</code>
                        <span>{sku.optionKey}</span>
                        <Status value={sku.status} />
                      </article>
                    ))}
                  </div>
                )}
              </RelationSection>
              <RelationSection title="Identifier" empty="등록된 Identifier가 없습니다.">
                {detail.data.identifiers.length > 0 && (
                  <div className="relation-grid">
                    {detail.data.identifiers.map((identifier) => (
                      <article key={identifier.publicId}>
                        <strong>
                          {identifier.type} · {identifier.value}
                        </strong>
                        <code>{identifier.publicId}</code>
                        <span>
                          {identifier.isVerified ? "검증됨" : "미검증"} · {identifier.evidenceType}
                        </span>
                        {identifier.skuPublicId && <small>SKU {identifier.skuPublicId}</small>}
                      </article>
                    ))}
                  </div>
                )}
              </RelationSection>
              <RelationSection title="Source Mapping" empty="연결된 Source 상품이 없습니다.">
                {detail.data.sources.length > 0 && (
                  <div className="source-list">
                    {detail.data.sources.map((source) => (
                      <article className="source-card" key={source.publicId}>
                        <div>
                          <strong>
                            {source.platform.name} · {source.externalProductId}
                          </strong>
                          <code>{source.publicId}</code>
                        </div>
                        <Status value={source.matchStatus} />
                        <p>{source.rawProductName}</p>
                        <small>
                          최근 확인 {date(source.lastSeenAt)} · Source SKU {source.skus.length}건
                        </small>
                        {source.skus.length > 0 && (
                          <ul>
                            {source.skus.map((sku) => (
                              <li key={sku.publicId}>
                                <code>{sku.publicId}</code>
                                <span>{sku.rawOptionName}</span>
                                <small>
                                  {sku.canonicalSkuPublicId
                                    ? `MASTER SKU ${sku.canonicalSkuPublicId}`
                                    : "MASTER SKU 미연결"}
                                </small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </RelationSection>
              <RelationSection title="원본 이미지" empty="등록된 원본 이미지가 없습니다.">
                {detail.data.sourceImages.length > 0 && (
                  <div className="relation-grid image-relations">
                    {detail.data.sourceImages.map((image) => (
                      <article key={image.publicId}>
                        <strong>{image.type}</strong>
                        <code>{image.publicId}</code>
                        <span>
                          {image.processStatus} · revision {image.sourceRevision}
                        </span>
                        {image.sourceProductPublicId && (
                          <small>Source {image.sourceProductPublicId}</small>
                        )}
                        {image.sourceUrl && (
                          <a href={image.sourceUrl} target="_blank" rel="noreferrer">
                            원본 링크 열기
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </RelationSection>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function RelationSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasChildren = Boolean(children);
  return (
    <section className="relation-section">
      <h3>{title}</h3>
      {hasChildren ? children : <p className="empty-relation">{empty}</p>}
    </section>
  );
}
