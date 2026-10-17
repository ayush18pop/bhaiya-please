/**
 * Structured JSON-lines logger. Every line passes through the redactor, so keys never reach logs.
 * Channel targets (push endpoints, Expo tokens, webhook URLs) are never passed to the logger.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: Level, msg: string, data?: Record<string, unknown>) => void;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(redact: (s: string) => string, min: Level = 'info'): Logger {
  return (level, msg, data) => {
    if (ORDER[level] < ORDER[min]) return;
    const line = JSON.stringify(
      { t: new Date().toISOString(), level, msg, ...(data ?? {}) },
      (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    );
    const out = redact(line);
    if (level === 'error' || level === 'warn') process.stderr.write(`${out}\n`);
    else process.stdout.write(`${out}\n`);
  };
}

export function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
    const x = cur as { name?: string; code?: string; shortMessage?: string; message?: string; cause?: unknown };
    parts.push(`${x.name ?? 'Error'}${x.code ? `[${x.code}]` : ''}: ${(x.shortMessage ?? x.message ?? '').split('\n')[0]}`);
    cur = x.cause;
  }
  return (parts.join(' <- ') || String(e)).slice(0, 400);
}
