import { getServerUrl, getToken } from '../storage/settings';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getServerUrl();
  if (!base) throw new ApiError('No server configured yet.', 0);
  const token = await getToken();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch (e) {
    throw new ApiError('Could not reach the server. Check the address and your connection.', 0);
  }

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(`Server sent back something unexpected (HTTP ${res.status}).`, res.status);
  }

  if (!res.ok || json.ok === false) {
    throw new ApiError(json.error || `Request failed (HTTP ${res.status}).`, res.status);
  }
  return json as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

// ---- Auth ----
export const login = (username: string, password: string, deviceName: string) =>
  post<{ token: string; user: import('../storage/settings').UserProfile }>(
    '/api/mobile_auth.php?action=login',
    { username, password, device_name: deviceName }
  );

export const logout = () => post('/api/mobile_auth.php?action=logout');

// ---- Push token registration (SMS/voicemail pushes only) ----
export const registerPushToken = (fcm_token: string) =>
  post('/api/push_register.php', { action: 'register', fcm_token });

export const unregisterPushToken = (fcm_token: string) =>
  post('/api/push_register.php', { action: 'unregister', fcm_token });

// ---- Calling ----
export interface RtcCredentials {
  ok: boolean;
  login?: string;
  password?: string;
  error?: string;
}
export const getRtcCredentials = () => get<RtcCredentials>('/api/calls.php?action=token');

export interface CallRecord {
  id: number;
  phone: string;
  display: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration: number;
  recording_url: string | null;
  created_at: string;
}
export const listCalls = () => get<{ calls: CallRecord[] }>('/api/calls.php?action=history');

export const logCall = (phone: string, direction: 'inbound' | 'outbound', status: string, duration: number) =>
  post('/api/calls.php?action=log', { phone, direction, status, duration });

// ---- Messages ----
export interface ThreadSummary {
  phone: string;
  name: string | null;
  display: string;
  last_body: string;
  last_direction: 'inbound' | 'outbound';
  last_at: string;
  unread: number;
}
export const listThreads = () => get<{ threads: ThreadSummary[] }>('/api/messages.php?action=threads');

export interface MessageRecord {
  id: number;
  phone: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  created_at: string;
}
export const getThread = (phone: string) =>
  get<{ phone: string; display: string; messages: MessageRecord[] }>(
    `/api/messages.php?action=thread&phone=${encodeURIComponent(phone)}`
  );

export const sendMessage = (to: string, text: string) =>
  post<{ id: number; status: string }>('/api/send.php', { to, text });

export const archiveThread = (phone: string) => post('/api/messages.php?action=archive', { phone });
export const blockThread = (phone: string) => post('/api/messages.php?action=block', { phone });
export const deleteThread = (phone: string) => post('/api/messages.php?action=delete_thread', { phone });

// ---- Contacts ----
export interface Contact {
  id: number;
  phone: string;
  name: string | null;
  notes: string | null;
  display: string;
}
export const listContacts = () => get<{ contacts: Contact[] }>('/api/contacts.php?action=list');
export const saveContact = (phone: string, name: string, notes: string) =>
  post('/api/contacts.php?action=save', { phone, name, notes });
export const deleteContact = (phone: string) => post('/api/contacts.php?action=delete', { phone });

// ---- Voicemail ----
export interface Voicemail {
  id: number;
  phone: string;
  display: string;
  duration: number;
  listened: number;
  created_at: string;
}
export const listVoicemails = () => get<{ voicemails: Voicemail[] }>('/api/voicemails.php?action=list');
export const markVoicemailRead = (id: number) => post('/api/voicemails.php?action=mark_read', { id });
export const deleteVoicemail = (id: number) => post('/api/voicemails.php?action=delete', { id });
// The native audio player fetches this URL directly and can't attach an
// Authorization header, so this one endpoint also accepts the token as a
// query param (see api/voicemails.php).
export const voicemailAudioUrl = async (id: number) => {
  const base = await getServerUrl();
  const token = await getToken();
  return `${base}/api/voicemails.php?action=audio&id=${id}&token=${encodeURIComponent(token || '')}`;
};
