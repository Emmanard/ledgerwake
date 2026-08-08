import Fastify, { type FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./types.js";
import { Database } from "./db.js";
import { Metrics } from "./metrics.js";

export async function createAdminServer(config: AppConfig, db: Database, metrics: Metrics): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, requestTimeout: 10_000 });
  const token = config.admin.tokenEnv ? process.env[config.admin.tokenEnv] : undefined;
  const remoteBinding = !["127.0.0.1", "::1", "localhost"].includes(config.admin.host);
  if (remoteBinding && (!token || token.length < 32)) {
    throw new Error("Remote admin binding requires admin.tokenEnv referencing a secret of at least 32 characters");
  }

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/healthz") return;
    if (!token) return;
    const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    const expectedBuffer = Buffer.from(token);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/healthz", async () => ({ status: "alive" }));
  app.get("/readyz", async (_request, reply) => {
    try {
      await db.ping();
      return { status: "ready" };
    } catch {
      return await reply.code(503).send({ status: "not_ready" });
    }
  });
  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", metrics.registry.contentType);
    return await metrics.registry.metrics();
  });
  app.get("/v1/status", async () => await db.status());
  app.get("/v1/deliveries", async (request) => {
    const query = request.query as { limit?: string };
    return { deliveries: await db.listDeliveries(Number(query.limit ?? 100)) };
  });
  app.post("/v1/deliveries/:id/replay", async (request, reply) => {
    const { id } = request.params as { id: string };
    const replayed = await db.replayDelivery(id);
    return replayed ? { replayed: true } : await reply.code(409).send({ error: "delivery_not_replayable" });
  });
  return app;
}
