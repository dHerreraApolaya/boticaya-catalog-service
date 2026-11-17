import { EventEmitter } from "node:events";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { trackPoolShutdown } from "../../tests/helpers/poolShutdown.js";

it("waits for every client end event even when pool.end resolves early", async () => {
  const pool = new Pool();
  vi.spyOn(pool,"end").mockResolvedValue(undefined);
  const shutdown = trackPoolShutdown(pool);
  const first = new EventEmitter();
  const second = new EventEmitter();
  pool.emit("connect", first);
  pool.emit("connect", second);
  let closed = false;
  const closing = shutdown().then(() => { closed = true; });
  await Promise.resolve();
  expect(closed).toBe(false);
  first.emit("end");
  await Promise.resolve();
  expect(closed).toBe(false);
  second.emit("end");
  await closing;
  expect(closed).toBe(true);
  expect(pool.end).toHaveBeenCalledOnce();
});

it("handles a pool with no connections or clients already closed", async () => {
  const pool = new Pool();
  vi.spyOn(pool,"end").mockResolvedValue(undefined);
  const shutdown = trackPoolShutdown(pool);
  const client = new EventEmitter();
  pool.emit("connect",client);
  client.emit("end");
  await expect(shutdown()).resolves.toBeUndefined();
});
