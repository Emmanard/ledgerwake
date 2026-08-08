export type SubscriptionStatus =
  | "STARTING"
  | "ACTIVE"
  | "PAUSED"
  | "GAP_DETECTED"
  | "ERROR";

export interface EventFilter {
  type?: "contract" | "system";
  contractIds?: string[];
  topics?: string[][];
}

export interface AppConfig {
  rpcUrl: string;
  network: "testnet" | "public";
  databaseUrl: string;
  admin: { host: string; port: number; tokenEnv?: string };
  poll: { intervalMs: number; pageSize: number };
  delivery: {
    concurrency: number;
    timeoutMs: number;
    maxAttempts: number;
    allowPrivateDestinations: boolean;
  };
  subscription: {
    name: string;
    startLedger: number | "latest";
    filters: EventFilter[];
    webhookUrl: string;
    webhookSecretEnv: string;
  };
}

export interface RpcEvent {
  id: string;
  ledger: number;
  ledgerClosedAt?: string;
  contractId?: string;
  type: string;
  topic: string[];
  value: string;
  txHash?: string;
  pagingToken: string;
}

export interface StoredEvent extends RpcEvent {
  internalId: string;
  normalized: unknown | null;
}

export interface ClaimedDelivery {
  id: string;
  attemptCount: number;
  destinationId: string;
  url: string;
  secretEnv: string;
  subscriptionId: string;
  subscriptionName: string;
  event: StoredEvent;
}
