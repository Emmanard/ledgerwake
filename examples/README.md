# Examples

Minimal, standalone webhook receivers demonstrating the signature
verification contract in [docs/WEBHOOKS.md](../docs/WEBHOOKS.md). Each is a
single file, standard library only, nothing to install.

- [`webhook-receiver-python/receiver.py`](webhook-receiver-python/receiver.py)
- [`webhook-receiver-go/main.go`](webhook-receiver-go/main.go)

Both:

1. Read the exact raw request body before any parsing.
2. Verify `X-Ledgerwake-Signature` against `timestamp + "." + raw_body`.
3. Reject timestamps more than five minutes old or in the future.
4. Only parse JSON after the signature passes.
5. Log the delivery ID, event type, ledger, and normalized value.

Neither persists delivery IDs for deduplication -- a real receiver must
record the delivery ID atomically with whatever business operation it
triggers, and only return `2xx` once that operation is durable (see
docs/WEBHOOKS.md's retry/replay semantics for why).

Run either with `LEDGERWAKE_WEBHOOK_SECRET` set to the destination's shared
secret, then point a Ledgerwake webhook destination at it.
