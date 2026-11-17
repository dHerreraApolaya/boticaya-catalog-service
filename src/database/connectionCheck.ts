import { PRODUCT_QUERY } from "../products/product.repository.js";

interface ProbeClient {
  query(sql: string): Promise<unknown>;
  release(): void;
}

interface ProbePool {
  connect(): Promise<ProbeClient>;
}

export async function verifyCatalogConnection(pool: ProbePool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query(`SELECT * FROM (${PRODUCT_QUERY}) AS catalog LIMIT 0`);
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}
