import { scValToNative, xdr } from "@stellar/stellar-sdk";
import type { RpcEvent } from "./types.js";

export function normalizeEvent(event: RpcEvent): unknown | null {
  try {
    return {
      topics: event.topic.map((topic) => scValToNative(xdr.ScVal.fromXDR(topic, "base64"))),
      value: scValToNative(xdr.ScVal.fromXDR(event.value, "base64"))
    };
  } catch {
    return null;
  }
}
