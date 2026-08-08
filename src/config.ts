import { Ajv, type ErrorObject } from "ajv";
import { readFile } from "node:fs/promises";
import type { AppConfig } from "./types.js";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["rpcUrl", "network", "databaseUrl", "admin", "poll", "delivery", "subscription"],
  properties: {
    rpcUrl: { type: "string", minLength: 1 },
    network: { enum: ["testnet", "public"] },
    databaseUrl: { type: "string", minLength: 1 },
    admin: {
      type: "object",
      additionalProperties: false,
      required: ["host", "port"],
      properties: {
        host: { type: "string", minLength: 1 },
        port: { type: "integer", minimum: 1, maximum: 65535 },
        tokenEnv: { type: "string", pattern: "^[A-Z][A-Z0-9_]+$" }
      }
    },
    poll: {
      type: "object",
      additionalProperties: false,
      required: ["intervalMs", "pageSize"],
      properties: {
        intervalMs: { type: "integer", minimum: 250, maximum: 300000 },
        pageSize: { type: "integer", minimum: 1, maximum: 10000 }
      }
    },
    delivery: {
      type: "object",
      additionalProperties: false,
      required: ["concurrency", "timeoutMs", "maxAttempts", "allowPrivateDestinations"],
      properties: {
        concurrency: { type: "integer", minimum: 1, maximum: 64 },
        timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
        maxAttempts: { type: "integer", minimum: 1, maximum: 100 },
        allowPrivateDestinations: { type: "boolean" }
      }
    },
    subscription: {
      type: "object",
      additionalProperties: false,
      required: ["name", "startLedger", "filters", "webhookUrl", "webhookSecretEnv"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 100 },
        startLedger: { anyOf: [{ const: "latest" }, { type: "integer", minimum: 1 }] },
        filters: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { enum: ["contract", "system"] },
              contractIds: {
                type: "array",
                maxItems: 5,
                items: { type: "string", minLength: 1 }
              },
              topics: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "array",
                  minItems: 1,
                  maxItems: 4,
                  items: { type: "string", minLength: 1 }
                }
              }
            }
          }
        },
        webhookUrl: { type: "string", minLength: 1 },
        webhookSecretEnv: { type: "string", pattern: "^[A-Z][A-Z0-9_]+$" }
      }
    }
  }
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export async function loadConfig(path: string): Promise<AppConfig> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!validate(raw)) {
    const details = validate.errors?.map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message}`).join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }

  const config = raw as AppConfig;
  const rpc = new URL(config.rpcUrl);
  const webhook = new URL(config.subscription.webhookUrl);
  const localRpc = ["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname);
  if (rpc.username || rpc.password) throw new Error("rpcUrl must not contain credentials");
  if (rpc.protocol !== "https:" && !(rpc.protocol === "http:" && localRpc)) {
    throw new Error("rpcUrl must use HTTPS except for an explicit localhost endpoint");
  }
  if (webhook.username || webhook.password) throw new Error("webhookUrl must not contain credentials");
  if (webhook.protocol !== "https:" && !(webhook.protocol === "http:" && config.delivery.allowPrivateDestinations)) {
    throw new Error("webhookUrl must use HTTPS unless unsafe local destinations are explicitly enabled");
  }
  return config;
}

export function redactConfig(config: AppConfig): Record<string, unknown> {
  return {
    ...config,
    databaseUrl: "[REDACTED]",
    subscription: { ...config.subscription, webhookUrl: redactUrl(config.subscription.webhookUrl) }
  };
}

export function redactUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  return url.toString();
}

export const NETWORK_PASSPHRASES = {
  testnet: "Test SDF Network ; September 2015",
  public: "Public Global Stellar Network ; September 2015"
} as const;
