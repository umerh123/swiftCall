/** Matches the web dialer's normalize() (webapp/assets/app.js) — Telnyx's
 *  trunk expects a full E.164 destination and silently fails the call
 *  almost immediately if it doesn't get one, which from the UI looks like
 *  the call screen flashing and bouncing straight back to the dial pad. */
export function normalizePhoneNumber(raw: string): string {
  const digits = String(raw || '').replace(/[^0-9+]/g, '');
  if (!digits) return '';
  if (digits[0] === '+') return digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}
