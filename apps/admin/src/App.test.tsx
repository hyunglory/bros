import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App routes", () => {
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
