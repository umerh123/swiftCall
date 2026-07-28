import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  phone_number: string | null;
  role: string;
}

const SERVER_URL_KEY = '@dialer/server_url';
const TOKEN_KEY = '@dialer/token';
const USER_KEY = '@dialer/user';

/** Always without a trailing slash, e.g. https://yourdomain.com/dialer */
export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(SERVER_URL_KEY);
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ''));
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getUser(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setUser(user: UserProfile): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Clears the session but keeps the remembered server URL. */
export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}
