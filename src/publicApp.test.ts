import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicCatalogApp } from "./publicApp.js";

const origin = "https://demo.example.org";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});
async function setup(verifyReader = vi.fn(async () => {})) {
  const query = vi.fn(async () => ({ rows: [] }));
  const app = createPublicCatalogApp({ query } as unknown as Pool, { allowedOrigin: origin, verifyReader });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { query, verifyReader, get: (path: string, init?: RequestInit) => fetch(url + path, init) };
}

describe("public demo boundary", () => {
  it("requires an exact HTTPS origin", () => {
    for (const allowedOrigin of ["", "http://example.org", "https://example.org/path", "https://example.org/"]) {
      expect(() => createPublicCatalogApp({} as Pool, { allowedOrigin, verifyReader: async () => {} })).toThrow();
    }
  });
  it("exposes health without database access and hardens responses", async () => {
    const { get, query, verifyReader } = await setup();
    const result = await get("/healthz");
    expect(await result.json()).toEqual({ status: "ok", mode: "demo-read-only" });
    expect(result.headers.get("x-powered-by")).toBeNull();
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(query).not.toHaveBeenCalled();
    expect(verifyReader).not.toHaveBeenCalled();
  });
  it.each(["/api/orders", "/api/products", "/api/inventory", "/.env", "/unknown"])("blocks %s before database access", async path => {
    const { get, verifyReader } = await setup();
    expect((await get(path)).status).toBe(404);
    expect(verifyReader).not.toHaveBeenCalled();
  });
  it("rejects writes, long URLs and unapproved origins without queries", async () => {
    const { get, verifyReader } = await setup();
    expect((await get("/api/categories", { method: "POST", body: "invalid json" })).status).toBe(405);
    expect((await get("/api/categories?q=" + "x".repeat(2048))).status).toBe(414);
    expect((await get("/api/categories", { headers: { Origin: "https://evil.example.org" } })).status).toBe(403);
    expect(verifyReader).not.toHaveBeenCalled();
  });
  it("permits exact-origin preflight and HEAD without database health probes", async () => {
    const { get, verifyReader } = await setup();
    const preflight = await get("/api/categories", { method: "OPTIONS", headers: { Origin: origin } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
    const head = await get("/healthz", { method: "HEAD" });
    expect(await head.text()).toBe("");
    expect(verifyReader).not.toHaveBeenCalled();
  });
  it("verifies the reader once and shares readiness across concurrent reads", async () => {
    const { get, verifyReader, query } = await setup();
    const results = await Promise.all([get("/api/categories"), get("/api/categories")]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(verifyReader).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("fails closed with a generic error and retries a failed readiness check", async () => {
    const verifyReader = vi.fn(async () => {}).mockRejectedValueOnce(new Error("private database detail"));
    const { get, query } = await setup(verifyReader);
    const result = await get("/api/categories");
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private database detail");
    expect(query).not.toHaveBeenCalled();
    expect((await get("/api/categories")).status).toBe(200);
    expect(verifyReader).toHaveBeenCalledTimes(2);
  });
});
