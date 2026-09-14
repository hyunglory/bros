import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App routes", () => {
  it("registers the Import management route", () => {
    render(
      <MemoryRouter initialEntries={["/imports"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Import 관리" })).toBeVisible();
  });

  it("registers the MASTER product route", () => {
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "MASTER 상품관리" })).toBeVisible();
  });

  it("registers the unresolved brand review route", () => {
    render(
      <MemoryRouter initialEntries={["/brand-reviews"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "미해결 브랜드 검수" })).toBeVisible();
  });

  it("renders a fallback page for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "요청한 화면을 찾을 수 없습니다." })).toBeVisible();
    expect(screen.getByRole("link", { name: "대시보드로 이동" })).toHaveAttribute("href", "/");
  });
});
