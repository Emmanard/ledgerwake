import { randomUUID } from "node:crypto";
import type { EventFilter, RpcEvent } from "./types.js";

interface JsonRpcEnvelope<T> {
  jsonrpc: "2.0";
  id: string | number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface EventPage {
  events: RpcEvent[];
  cursor?: string;
  latestLedger?: number;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export class StellarRpcClient {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async getLatestLedger(): Promise<number> {
    const result = await this.call<{ sequence: number }>("getLatestLedger", {});
    if (!Number.isSafeInteger(result.sequence) || result.sequence < 1) {
      throw new RpcError("RPC returned an invalid latest ledger sequence");
    }
    return result.sequence;
  }

  async getNetworkPassphrase(): Promise<string> {
    const result = await this.call<{ passphrase: string }>("getNetwork", {});
    if (!result.passphrase) throw new RpcError("RPC returned no network passphrase");
    return result.passphrase;
  }

  async getEvents(input: {
    filters: EventFilter[];
    limit: number;
    startLedger?: number;
    cursor?: string;
  }): Promise<EventPage> {
    const pagination: { limit: number; cursor?: string } = { limit: input.limit };
    if (input.cursor) pagination.cursor = input.cursor;
    const params: Record<string, unknown> = {
      filters: input.filters,
      pagination,
      xdrFormat: "base64"
    };
    if (input.startLedger !== undefined) params.startLedger = input.startLedger;

    const result = await this.call<{
      events: Array<Record<string, unknown>>;
      cursor?: string;
      latestLedger?: number;
    }>("getEvents", params);

    const events = result.events.map(parseEvent);
    return {
      events,
      ...(result.cursor ? { cursor: result.cursor } : {}),
      ...(result.latestLedger !== undefined ? { latestLedger: result.latestLedger } : {})
    };
  }

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params })
      });
      if (!response.ok) throw new RpcError(`RPC HTTP ${response.status}`);
      const text = await readBoundedBody(response, 2_000_000);
      const envelope = JSON.parse(text) as JsonRpcEnvelope<T>;
      if (envelope.error) throw new RpcError(envelope.error.message, envelope.error.code, envelope.error.data);
      if (envelope.result === undefined) throw new RpcError("RPC response contained neither result nor error");
      return envelope.result;
    } catch (error) {
      if (error instanceof RpcError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new RpcError("RPC request timed out");
      throw new RpcError(error instanceof Error ? error.message : "Unknown RPC failure");
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new RpcError("RPC response exceeds size limit");
  const body = await response.arrayBuffer();
  if (body.byteLength > maxBytes) throw new RpcError("RPC response exceeds size limit");
  return new TextDecoder().decode(body);
}

function parseEvent(value: Record<string, unknown>): RpcEvent {
  const id = requiredString(value, "id");
  const pagingToken = typeof value.pagingToken === "string" ? value.pagingToken : id;
  const ledger = Number(value.ledger);
  if (!Number.isSafeInteger(ledger) || ledger < 1) throw new RpcError("RPC event has invalid ledger");
  const topic = Array.isArray(value.topic) && value.topic.every((part) => typeof part === "string")
    ? (value.topic as string[])
    : [];
  return {
    id,
    pagingToken,
    ledger,
    type: requiredString(value, "type"),
    topic,
    value: requiredString(value, "value"),
    ...(typeof value.ledgerClosedAt === "string" ? { ledgerClosedAt: value.ledgerClosedAt } : {}),
    ...(typeof value.contractId === "string" ? { contractId: value.contractId } : {}),
    ...(typeof value.txHash === "string" ? { txHash: value.txHash } : {})
  };
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || !candidate) throw new RpcError(`RPC event missing ${key}`);
  return candidate;
}
