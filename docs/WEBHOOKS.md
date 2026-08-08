# Webhook Contract

Ledgerwake provides at-least-once delivery. Receivers must be idempotent.

## Envelope

```json
{
  "specversion": "1.0",
  "id": "delivery-uuid",
  "type": "stellar.contract.event",
  "source": "ledgerwake://subscription/subscription-uuid",
  "time": "2026-08-08T12:00:00Z",
  "subject": "stellar-event-id",
  "data": {
    "ledger": 123456,
    "contractId": "C...",
    "eventType": "contract",
    "topics": [],
    "value": "base64-xdr",
    "normalized": null,
    "transactionHash": null
  }
}
```

Raw XDR is authoritative. `normalized` is best effort and may be `null` when the SDK cannot decode a custom value.

## Signature verification

Headers:

```text
X-Ledgerwake-Delivery: <uuid>
X-Ledgerwake-Timestamp: <unix-seconds>
X-Ledgerwake-Signature: v1=<hex-hmac-sha256>
```

Pseudocode:

```text
signed = timestamp + "." + exact_raw_body_bytes
expected = "v1=" + hex(HMAC-SHA256(secret, signed))
constant_time_equal(expected, received_signature)
```

Reject timestamps older/newer than five minutes, verify before JSON parsing, then atomically record the delivery ID with the business operation. Return any `2xx` only after the operation is durably accepted.

## Retries

Ledgerwake retries network errors, timeouts, `408`, `425`, `429`, and `5xx`. Most other `4xx` responses become dead letters. Backoff uses bounded exponential full jitter. Manual replay retains the stable delivery ID, so receiver deduplication remains essential.

## Encryption

HTTPS is mandatory in production. HMAC provides authenticity and integrity, not confidentiality. The alpha does not add custom payload encryption because Stellar events are public and custom encryption would introduce a second key-management system. Application-layer JWE/HPKE may be considered later for environments where TLS termination is outside the receiver's trust boundary.
