import { describe, expect, it, vi } from "vitest";
import { fetchHealth } from "./health";
import type { HealthClientError } from "./health";

describe("fetchHealth", () => {
  it("accepts the shared health response contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(fetchHealth(fetcher)).resolves.toEqual({ status: "ok" });
    expect(fetcher).toHaveBeenCalledWith(
      "/health",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });

  it("rejects a successful response that violates the contract", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: "degraded" }), { status: 200 }));

    await expect(fetchHealth(fetcher)).rejects.toMatchObject<Partial<HealthClientError>>({
      kind: "invalid-response",
    });

    const malformedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(fetchHealth(malformedFetcher)).rejects.toMatchObject<Partial<HealthClientError>>({
      kind: "invalid-response",
    });
  });

  it("classifies HTTP and connection failures without exposing response bodies", async () => {
    const httpFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret upstream detail", { status: 503 }));
    const offlineFetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private host detail"));

    await expect(fetchHealth(httpFetcher)).rejects.toMatchObject<Partial<HealthClientError>>({
      kind: "http",
      status: 503,
    });
    await expect(fetchHealth(offlineFetcher)).rejects.toMatchObject<Partial<HealthClientError>>({
      kind: "unreachable",
      message: "API에 연결할 수 없습니다.",
    });
  });
});
