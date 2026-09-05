#!/usr/bin/env python3
"""Example webhook receiver for Ledgerwake deliveries.

Verifies the HMAC-SHA256 signature exactly as specified in
docs/WEBHOOKS.md, then logs the normalized event. Standard library
only -- nothing to install.

Run:
    LEDGERWAKE_WEBHOOK_SECRET=your-shared-secret python3 receiver.py

This is a minimal example, not production code: it does not persist
delivery IDs for deduplication, and "accepting" a delivery here just
means printing it. A real receiver must record the delivery ID
atomically with whatever business operation it triggers, and only
return 2xx once that operation is durable.
"""

import hashlib
import hmac
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("LEDGERWAKE_WEBHOOK_SECRET")
if not SECRET:
    sys.exit("Set LEDGERWAKE_WEBHOOK_SECRET before starting the receiver.")

MAX_CLOCK_SKEW_SECONDS = 5 * 60


def verify_signature(timestamp: str, raw_body: bytes, received_signature: str) -> bool:
    signed = f"{timestamp}.".encode() + raw_body
    digest = hmac.new(SECRET.encode(), signed, hashlib.sha256).hexdigest()
    expected = f"v1={digest}"
    return hmac.compare_digest(expected, received_signature)


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)

        timestamp = self.headers.get("X-Ledgerwake-Timestamp", "")
        signature = self.headers.get("X-Ledgerwake-Signature", "")
        delivery_id = self.headers.get("X-Ledgerwake-Delivery", "")

        if not timestamp.isdigit():
            self._respond(400, "missing or invalid timestamp")
            return

        skew = abs(time.time() - int(timestamp))
        if skew > MAX_CLOCK_SKEW_SECONDS:
            self._respond(401, "timestamp outside allowed window")
            return

        if not verify_signature(timestamp, raw_body, signature):
            self._respond(401, "signature verification failed")
            return

        # Only parse JSON after the signature has been verified.
        try:
            envelope = json.loads(raw_body)
        except json.JSONDecodeError:
            self._respond(400, "invalid JSON body")
            return

        # A real receiver: atomically record `delivery_id` with the
        # business operation here, for idempotency, before returning 2xx.
        data = envelope.get("data", {})
        print(
            f"[{delivery_id}] {envelope.get('type')} on ledger "
            f"{data.get('ledger')} -> normalized: {data.get('normalized')}"
        )

        self._respond(200, "accepted")

    def _respond(self, status: int, message: str):
        body = json.dumps({"message": message}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # quiet default request logging; remove this to debug


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8787))
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    print(f"Ledgerwake example receiver listening on :{port}")
    server.serve_forever()
