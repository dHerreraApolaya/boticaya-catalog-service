import { readConfig } from "../dist/config.js";
import { createPool } from "../dist/database/pool.js";
import { verifyCatalogConnection } from "../dist/database/connectionCheck.js";

let pool;
try {
  pool = createPool(readConfig(process.env));
  await verifyCatalogConnection(pool);
  process.stdout.write(
    "Database connection and catalog projection verified in a read-only transaction. No rows were retrieved.\n",
  );
} catch {
  process.stderr.write(
    "Database verification failed. Check environment configuration, TLS certificate, network access, catalog schema and SELECT permissions. No credentials are logged.\n",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
