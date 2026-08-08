import { Database } from "./db.js";
import { log } from "./log.js";
import { Metrics } from "./metrics.js";
import { sendWebhook } from "./webhook.js";
import type { AppConfig, ClaimedDelivery } from "./types.js";

export class DeliveryWorker {
  private active = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly db: Database,
    private readonly metrics: Metrics
  ) {}

  async tick(): Promise<void> {
    while (this.active < this.config.delivery.concurrency) {
      const delivery = await this.db.claimDelivery();
      if (!delivery) return;
      this.active += 1;
      void this.deliver(delivery).finally(() => { this.active -= 1; });
    }
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    const startedAt = new Date();
    const timer = this.metrics.deliveryLatency.startTimer();
    let statusCode: number | undefined;
    let errorClass: string | undefined;
    let retryable = true;
    let delivered = false;
    try {
      const secret = process.env[delivery.secretEnv];
      if (!secret || secret.length < 32) throw new Error("missing_or_short_webhook_secret");
      const result = await sendWebhook({
        delivery,
        secret,
        timeoutMs: this.config.delivery.timeoutMs,
        allowPrivate: this.config.delivery.allowPrivateDestinations
      });
      statusCode = result.statusCode;
      retryable = result.retryable;
      delivered = statusCode >= 200 && statusCode < 300;
      if (!delivered) errorClass = `http_${statusCode}`;
    } catch (error) {
      errorClass = classifyError(error);
      retryable = errorClass !== "unsafe_destination" && errorClass !== "missing_or_short_webhook_secret";
    } finally {
      timer();
    }

    const exhausted = delivery.attemptCount >= this.config.delivery.maxAttempts;
    const outcome = delivered ? "DELIVERED" : (!retryable || exhausted ? "DEAD" : "RETRY_WAIT");
    const nextAttemptAt = outcome === "RETRY_WAIT" ? nextRetry(delivery.attemptCount) : undefined;
    await this.db.finishDelivery({
      delivery,
      startedAt,
      finishedAt: new Date(),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(errorClass ? { errorClass } : {}),
      outcome,
      ...(nextAttemptAt ? { nextAttemptAt } : {})
    });
    this.metrics.deliveryAttempts.inc({ result: outcome.toLowerCase() });
    log(delivered ? "info" : "warn", "delivery", delivered ? "Webhook delivered" : "Webhook delivery failed", {
      deliveryId: delivery.id,
      attempt: delivery.attemptCount,
      outcome,
      statusCode,
      errorClass
    });
  }
}

export function nextRetry(attempt: number, now = Date.now(), random = Math.random): Date {
  const capMs = 60 * 60 * 1000;
  const baseMs = Math.min(capMs, 1000 * 2 ** Math.min(attempt - 1, 12));
  return new Date(now + Math.floor(random() * baseMs));
}

function classifyError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  if (["unsafe_destination", "missing_or_short_webhook_secret", "delivery_timeout"].includes(error.message)) return error.message;
  const code = (error as NodeJS.ErrnoException).code;
  return code ? `network_${code.toLowerCase()}` : "network_error";
}
