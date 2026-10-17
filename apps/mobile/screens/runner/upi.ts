/** UPI QR text helpers (device-only; the runner's QR is never uploaded). */
const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** Accepts a UPI ID (name@bank) or the text from a UPI QR (upi://pay?…). Returns the QR text or null. */
export function normalizeUpi(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^upi:\/\//i.test(s)) return /[?&]pa=[^&]+@/i.test(s) ? s : null;
  if (VPA.test(s)) return `upi://pay?pa=${s}&cu=INR`;
  return null;
}

/** "name@bank" for display. */
export function upiId(qr: string | null | undefined): string | null {
  if (!qr) return null;
  const m = /[?&]pa=([^&]+)/i.exec(qr);
  return m ? decodeURIComponent(m[1]!) : null;
}
