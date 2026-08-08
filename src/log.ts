const SECRET_KEY = /(authorization|secret|token|password|databaseurl)/i;

export function log(level: "debug" | "info" | "warn" | "error", component: string, message: string, fields: Record<string, unknown> = {}): void {
  const safe = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : value])
  );
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, component, message, ...safe })}\n`);
}
