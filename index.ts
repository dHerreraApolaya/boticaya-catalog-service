import express from "express";
import { attachDatabasePool } from "@vercel/functions";
import { readConfig } from "./src/config.js";
import { createPool } from "./src/database/pool.js";
import { verifyCatalogReader } from "./src/database/readerCheck.js";
import { createPublicCatalogApp } from "./src/publicApp.js";

const config = readConfig(process.env);
if (!config.BOTICAYA_DB_SSL || config.BOTICAYA_ORDERS_ENABLED) {
  throw new Error("Public deployment requires TLS and disabled orders");
}
const pool = createPool(config, { serverless: true });
pool.on("error", () => console.error("Catalog database connection failed"));
attachDatabasePool(pool);
const app = express();
app.disable("x-powered-by");
app.use(createPublicCatalogApp(pool, {
  allowedOrigin: process.env.BOTICAYA_WEB_ORIGIN ?? "",
  verifyReader: () => verifyCatalogReader(pool),
}));
export default app;
