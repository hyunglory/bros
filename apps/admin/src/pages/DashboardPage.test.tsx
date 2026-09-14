import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("renders loading and then the healthy API state", async () => {
    let resolveHealth: ((value: { status: "ok" }) => void) | undefined;
    const loadHealth = vi.fn(
      () =>
        new Promise<{ status: "ok" }>((resolve) => {
          resolveHealth = resolve;
        }),
    );

    render(<DashboardPage loadHealth={loadHealth} />);
    expect(screen.getByRole("status")).toHaveTextContent("API 상태 확인 중");

    resolveHealth?.({ status: "ok" });
    expect(await screen.findByText("정상 운영 중")).toBeInTheDocument();
  });

  it("renders a safe error and retries the request", async () => {
    const loadHealth = vi
      .fn<() => Promise<{ status: "ok" }>>()
      .mockRejectedValueOnce(new Error("API에 연결할 수 없습니다."))
      .mockResolvedValueOnce({ status: "ok" });

    render(<DashboardPage loadHealth={loadHealth} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("API에 연결할 수 없습니다.");

    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(await screen.findByText("정상 운영 중")).toBeInTheDocument();
    expect(loadHealth).toHaveBeenCalledTimes(2);
  });
});
