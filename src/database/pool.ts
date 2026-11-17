import { readFileSync } from "node:fs";
import { Pool } from "pg";
import type { ApiConfig } from "../config.js";

export function createPool(config: ApiConfig, options: { serverless?: boolean } = {}): Pool {
  const ca = config.BOTICAYA_DB_CA_PEM ?? (config.BOTICAYA_DB_CA_FILE
    ? readFileSync(config.BOTICAYA_DB_CA_FILE, "utf8")
    : undefined);
  return new Pool({
    host: config.BOTICAYA_DB_HOST,
    port: config.BOTICAYA_DB_PORT,
    database: config.BOTICAYA_DB_NAME,
    user: config.BOTICAYA_DB_USER,
    password: config.BOTICAYA_DB_PASSWORD,
    ssl: config.BOTICAYA_DB_SSL
      ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
      : false,
    max: options.serverless ? 2 : 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: options.serverless ? 5000 : 30000,
    statement_timeout: 10000,
    application_name: "api-botica-ya-express",
  });
}
