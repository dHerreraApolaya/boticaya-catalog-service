import { describe, expect, it, vi } from "vitest";
import {
  READER_PERMISSION_QUERY,
  verifyCatalogReader,
  type ReaderProbeClient,
} from "./readerCheck.js";

function probe(rows: { allowed?: boolean }[] = [{ allowed: true }]) {
  const query = vi.fn(async (sql: string) => ({
    rows: sql === READER_PERMISSION_QUERY ? rows : [],
  }));
  const client: ReaderProbeClient = {
    query,
    release: vi.fn(),
    connection: { stream: { encrypted: true, authorized: true } },
  };
  return { client, pool: { connect: vi.fn(async () => client) }, query };
}

describe("catalog reader verification", () => {
  it("checks effective privileges without retrieving product or identity rows", async () => {
    const { client, pool, query } = probe();
    await verifyCatalogReader(pool);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN READ ONLY",
      "SET LOCAL statement_timeout='5s'",
      READER_PERMISSION_QUERY,
      "ROLLBACK",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects a failed privilege assessment and still rolls back", async () => {
    const { client, pool, query } = probe([{ allowed: false }]);
    await expect(verifyCatalogReader(pool)).rejects.toThrow(
      "Catalog reader verification failed",
    );
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    { rows: [] },
    { rows: [{ allowed: undefined }] },
    { rows: [{ allowed: true }, { allowed: true }] },
  ])(
    "fails closed on a missing or unexpected result",
    async ({ rows }) => {
      const { client, pool } = probe(rows);
      await expect(verifyCatalogReader(pool)).rejects.toThrow();
      expect(client.release).toHaveBeenCalledOnce();
    },
  );

  it.each([
    undefined,
    {},
    { stream: null },
    { stream: "untrusted" },
    { stream: {} },
    { stream: { encrypted: true } },
    { stream: { encrypted: false, authorized: true } },
    { stream: { encrypted: true, authorized: false } },
  ])("rejects unverified TLS when required", async (connection) => {
    const { client, pool, query } = probe();
    client.connection = connection;
    await expect(verifyCatalogReader(pool)).rejects.toThrow();
    expect(query).not.toHaveBeenCalledWith(READER_PERMISSION_QUERY);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("allows an explicitly selected isolated local connection without TLS", async () => {
    const { client, pool } = probe();
    client.connection = undefined;
    await verifyCatalogReader(pool, { requireTls: false });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases the connection even if metadata query and rollback fail", async () => {
    const { client, pool, query } = probe();
    query.mockImplementation(async (sql) => {
      if (sql === READER_PERMISSION_QUERY || sql === "ROLLBACK")
        throw new Error("Database operation failed");
      return { rows: [] };
    });
    await expect(verifyCatalogReader(pool)).rejects.toThrow();
    expect(client.release).toHaveBeenCalledOnce();
  });
});
