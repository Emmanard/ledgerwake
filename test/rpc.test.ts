import assert from "node:assert/strict";
import { test } from "node:test";
import { StellarRpcClient } from "../src/rpc.js";

test("RPC client sends legal cursor pagination and parses events", async () => {
  const fakeFetch: typeof fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { id: string; method: string; params: { pagination: { cursor: string } } };
    assert.equal(payload.method, "getEvents");
    assert.equal(payload.params.pagination.cursor, "cursor-1");
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        cursor: "cursor-2",
        latestLedger: 101,
        events: [{ id: "event-1", ledger: 100, type: "contract", topic: [], value: "AAAAAQ==", pagingToken: "pt-1" }]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new StellarRpcClient("http://127.0.0.1:8000", 10_000, fakeFetch);
  const page = await client.getEvents({ filters: [{ type: "contract" }], limit: 100, cursor: "cursor-1" });
  assert.equal(page.events[0]?.id, "event-1");
  assert.equal(page.cursor, "cursor-2");
});
