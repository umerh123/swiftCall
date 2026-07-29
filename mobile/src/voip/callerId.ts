import { getUser } from '../storage/settings';

/** Telnyx trunks commonly reject outbound calls that don't carry a
 *  verified caller ID — the web dialer always sends the signed-in
 *  account's own number as callerNumber (see webapp/index.php's
 *  window.MY_NUMBER), which the mobile app was never doing. Cached
 *  in memory at boot so every call site can read it synchronously. */
let cached: string | null = null;

export async function loadCallerNumber(): Promise<void> {
  const user = await getUser();
  cached = user?.phone_number || null;
}

export function getCallerNumber(): string | null {
  return cached;
}
