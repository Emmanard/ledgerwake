#!/usr/bin/env node
import { parseArgs } from "node:util";
import { doctor, serve } from "./app.js";
import { loadConfig, redactConfig } from "./config.js";
import { Database } from "./db.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", short: "c", default: "ledgerwake.json" },
    output: { type: "string", default: "text" },
    limit: { type: "string", default: "100" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" }
  }
});

if (values.version) {
  process.stdout.write("Ledgerwake 0.1.0-alpha.1\n");
  process.exit(0);
}
if (values.help || positionals.length === 0) {
  usage();
  process.exit(values.help ? 0 : 2);
}

const command = positionals[0];
const subcommand = positionals[1];

try {
  const config = await loadConfig(values.config!);
  if (command === "config" && subcommand === "validate") {
    print({ valid: true, config: redactConfig(config) }, values.output!);
  } else if (command === "db" && subcommand === "migrate") {
    const db = new Database(config.databaseUrl);
    try { await db.migrate(); } finally { await db.close(); }
    print({ migrated: true }, values.output!);
  } else if (command === "doctor") {
    const result = await doctor(config);
    print(result, values.output!);
    if (Object.values(result).some((value) => ["mismatch", "missing_or_short"].includes(String(value)))) process.exitCode = 1;
  } else if (command === "serve") {
    await serve(config);
  } else if (command === "status") {
    const db = new Database(config.databaseUrl);
    try { print(await db.status(), values.output!); } finally { await db.close(); }
  } else if (command === "delivery" && subcommand === "list") {
    const db = new Database(config.databaseUrl);
    try { print({ deliveries: await db.listDeliveries(Number(values.limit)) }, values.output!); } finally { await db.close(); }
  } else if (command === "delivery" && subcommand === "replay" && positionals[2]) {
    const db = new Database(config.databaseUrl);
    try { print({ replayed: await db.replayDelivery(positionals[2]) }, values.output!); } finally { await db.close(); }
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown failure" })}\n`);
  process.exitCode = 1;
}

function print(value: unknown, format: string): void {
  if (format === "json") process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(`Ledgerwake — Every event leaves a wake.

Usage: wake <command> [options]

Commands:
  config validate       Validate and safely display configuration
  db migrate            Apply PostgreSQL migrations
  doctor                Check database, RPC network, destination, and secret
  serve                 Start ingestion, delivery workers, and admin API
  status                Show subscription and delivery state
  delivery list         List recent deliveries
  delivery replay <id>  Replay a dead or delivered webhook

Options:
  -c, --config <path>    Configuration path (default: ledgerwake.json)
  --output json          Machine-readable output
  --limit <number>       List limit, maximum 500
  -v, --version          Print version
  -h, --help             Show help
`);
}
