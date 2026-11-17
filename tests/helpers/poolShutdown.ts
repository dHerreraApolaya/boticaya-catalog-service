import type { Pool } from "pg";

export function trackPoolShutdown(pool: Pool): () => Promise<void> {
  const connections = new Set<Promise<void>>();
  pool.on("connect", (client) => {
    const ended = new Promise<void>((resolve) => client.once("end", resolve));
    connections.add(ended);
    void ended.then(() => connections.delete(ended));
  });
  return async () => {
    await pool.end();
    await Promise.all(connections);
  };
}
