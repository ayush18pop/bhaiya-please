const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const rupees = (n: number) => inr.format(n);

export const nowSec = () => Math.floor(Date.now() / 1000);

export function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "in 24 min" above 10 min, mm:ss at or below. */
export function countdownLabel(remainingSeconds: number) {
  if (remainingSeconds > 600) return `in ${Math.ceil(remainingSeconds / 60)} min`;
  return mmss(remainingSeconds);
}

export function daysFrom(unix: number, now = nowSec()) {
  return Math.round((unix - now) / 86400);
}

export function ago(unix: number, now = nowSec()) {
  const d = Math.max(0, now - unix);
  if (d < 10) return 'just now';
  if (d < 60) return `${d} s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86400)} d ago`;
}

export function monthYear(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function dateTime(unix: number) {
  return new Date(unix * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function formatEth(wei: bigint) {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${frac}`;
}
