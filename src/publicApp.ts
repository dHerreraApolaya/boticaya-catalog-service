import express from "express";
import type { Pool } from "pg";
import { createApp } from "./app.js";

const paths = new Set(["/api/categories", "/api/products/catalog", "/api/products/search"]);

export function createPublicCatalogApp(pool: Pool, options: {
  allowedOrigin: string;
  verifyReader: () => Promise<void>;
}) {
  const origin = new URL(options.allowedOrigin);
  if (origin.protocol !== "https:" || origin.origin !== options.allowedOrigin) {
    throw new Error("Invalid BOTICAYA_WEB_ORIGIN");
  }
  const app = express();
  app.disable("x-powered-by");
  let readiness: Promise<void> | undefined;
  app.use(async (request, response, next) => {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    });
    response.vary("Origin");
    if (request.originalUrl.length > 2048) {
      response.status(414).json({ error: "uri_too_long" }); return;
    }
    if (!paths.has(request.path) && request.path !== "/healthz") {
      response.status(404).json({ error: "not_found" }); return;
    }
    const requestOrigin = request.get("Origin");
    if (requestOrigin && requestOrigin !== options.allowedOrigin) {
      response.status(403).json({ error: "origin_not_allowed" }); return;
    }
    if (requestOrigin) response.set("Access-Control-Allow-Origin", options.allowedOrigin);
    response.set("Allow", "GET, HEAD, OPTIONS");
    if (request.method === "OPTIONS") {
      response.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      response.sendStatus(204); return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.status(405).json({ error: "method_not_allowed" }); return;
    }
    if (request.path === "/healthz") {
      response.json({ status: "ok", mode: "demo-read-only" }); return;
    }
    try {
      readiness ??= options.verifyReader().catch((error: unknown) => {
        readiness = undefined;
        throw error;
      });
      await readiness;
      next();
    } catch {
      response.status(503).json({ error: "service_unavailable", message: "Servicio temporalmente no disponible." });
    }
  });
  app.use(createApp(pool, { ordersEnabled: false }));
  return app;
}
