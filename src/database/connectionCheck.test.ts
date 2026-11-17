import { describe, expect, it, vi } from "vitest";
import { verifyCatalogConnection } from "./connectionCheck.js";

describe("read-only catalog connection check", () => {
  it("checks the catalog projection without fetching rows or changing data", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    await verifyCatalogConnection({
      connect: async () => ({ query, release }),
    });
    expect(query.mock.calls[0]?.[0]).toBe("BEGIN READ ONLY");
    expect(query.mock.calls[2]?.[0]).toContain("LIMIT 0");
    expect(query.mock.calls[2]?.[0]).toContain("public.products");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when the schema or permissions fail", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("permission denied"));
    const release = vi.fn();
    await expect(
      verifyCatalogConnection({ connect: async () => ({ query, release }) }),
    ).rejects.toThrow("permission denied");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the connection even when rollback fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("connection lost"));
    const release = vi.fn();
    await expect(
      verifyCatalogConnection({ connect: async () => ({ query, release }) }),
    ).rejects.toThrow("connection lost");
    expect(release).toHaveBeenCalledOnce();
  });

  it("propagates connection failures without attempting SQL", async () => {
    await expect(
      verifyCatalogConnection({
        connect: vi.fn().mockRejectedValue(new Error("unreachable")),
      }),
    ).rejects.toThrow("unreachable");
  });
});
