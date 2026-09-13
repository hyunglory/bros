import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "../api/health";
import type { HealthLoader } from "../api/health";

type HealthState =
  { phase: "loading" } | { checkedAt: Date; phase: "online" } | { message: string; phase: "error" };

interface DashboardPageProps {
  loadHealth?: HealthLoader;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "API 상태를 확인하지 못했습니다.";
}

export function DashboardPage({ loadHealth = fetchHealth }: DashboardPageProps) {
  const [health, setHealth] = useState<HealthState>({ phase: "loading" });

  const checkHealth = useCallback(async () => {
    setHealth({ phase: "loading" });
    try {
      await loadHealth();
      setHealth({ checkedAt: new Date(), phase: "online" });
    } catch (error) {
      setHealth({ message: getErrorMessage(error), phase: "error" });
    }
  }, [loadHealth]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  return (
    <div className="page dashboard-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">SYSTEM OVERVIEW</span>
          <h1>오늘의 운영 상태</h1>
          <p>핵심 서비스 연결 상태와 작업 진입점을 확인합니다.</p>
        </div>
        <time dateTime={new Date().toISOString()}>
          {new Intl.DateTimeFormat("ko-KR", {
            dateStyle: "full",
          }).format(new Date())}
        </time>
      </section>

      <section className="status-grid" aria-label="서비스 상태">
        <article className={`health-card health-card--${health.phase}`} aria-live="polite">
          <div className="card-heading">
            <div>
              <span className="card-kicker">API GATEWAY</span>
              <h2>Backend API</h2>
            </div>
            <span className="status-orb" aria-hidden="true" />
          </div>

          {health.phase === "loading" && (
            <div className="health-loading" role="status">
              <span className="loading-line loading-line--wide" />
              <span className="loading-line" />
              <span className="sr-only">API 상태 확인 중</span>
            </div>
          )}

          {health.phase === "online" && (
            <div className="health-result">
              <strong>정상 운영 중</strong>
              <p>/health 응답을 확인했습니다.</p>
              <span>
                마지막 확인 {health.checkedAt.toLocaleTimeString("ko-KR", { timeStyle: "short" })}
              </span>
            </div>
          )}

          {health.phase === "error" && (
            <div className="health-result health-result--error" role="alert">
              <strong>연결 확인 필요</strong>
              <p>{health.message}</p>
            </div>
          )}

          <button
            className="secondary-button"
            type="button"
            disabled={health.phase === "loading"}
            onClick={() => void checkHealth()}
          >
            {health.phase === "loading" ? "확인 중" : "다시 확인"}
          </button>
        </article>

        <article className="summary-card">
          <span className="card-kicker">FOUNDATION</span>
          <h2>관리 기능 준비 중</h2>
          <p>상품, 이미지, 검수 기능은 다음 단계부터 이 화면에 연결됩니다.</p>
          <div className="progress-track" aria-label="Phase 1 기반 구축 진행 중">
            <span />
          </div>
          <span className="progress-label">PLATFORM FOUNDATION</span>
        </article>
      </section>

      <section className="coming-soon" aria-labelledby="coming-soon-title">
        <div>
          <span className="eyebrow">NEXT MODULES</span>
          <h2 id="coming-soon-title">운영 도구</h2>
        </div>
        <div className="module-list">
          <div>
            <span>01</span>
            <strong>상품 카탈로그</strong>
            <small>준비 중</small>
          </div>
          <div>
            <span>02</span>
            <strong>이미지 검수</strong>
            <small>준비 중</small>
          </div>
          <div>
            <span>03</span>
            <strong>자동화 실행</strong>
            <small>준비 중</small>
          </div>
        </div>
      </section>
    </div>
  );
}
