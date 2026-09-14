import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <div>
            <strong>BROS</strong>
            <span>Operations</span>
          </div>
        </div>

        <nav aria-label="주 메뉴">
          <NavLink className="nav-item" to="/" end>
            <span className="nav-icon" aria-hidden="true">
              ◫
            </span>
            대시보드
          </NavLink>
          <NavLink className="nav-item" to="/imports">
            <span className="nav-icon" aria-hidden="true">
              ⇣
            </span>
            Import 관리
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <span className="environment-dot" aria-hidden="true" />
          개발 환경
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div>
            <span className="eyebrow">ADMIN CONSOLE</span>
            <strong>운영 관리</strong>
          </div>
          <span className="phase-badge">Phase 2</span>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
