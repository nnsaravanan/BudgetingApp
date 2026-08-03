const COGNITO_DOMAIN  = import.meta.env.VITE_COGNITO_DOMAIN as string;
const CLIENT_ID       = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
const REDIRECT_URI    = import.meta.env.VITE_REDIRECT_URI as string;

const TOKEN_KEY = 'ba_tokens';

interface StoredTokens {
  id_token: string;
  refresh_token: string;
  expires_at: number; // ms since epoch
}

function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: StoredTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

function jwtExpiry(token: string): number {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return (payload.exp as number) * 1000;
}

async function refresh(refreshToken: string): Promise<StoredTokens | null> {
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { id_token: string; expires_in: number };
  const tokens: StoredTokens = {
    id_token:      data.id_token,
    refresh_token: refreshToken,
    expires_at:    jwtExpiry(data.id_token),
  };
  saveTokens(tokens);
  return tokens;
}

export async function getValidToken(): Promise<string | null> {
  const stored = readTokens();
  if (!stored) return null;

  // Refresh 60 seconds before actual expiry to avoid edge cases
  if (Date.now() < stored.expires_at - 60_000) return stored.id_token;

  const refreshed = await refresh(stored.refresh_token);
  return refreshed?.id_token ?? null;
}

export function isAuthenticated(): boolean {
  return readTokens() !== null;
}

export function login() {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    scope:         'openid email profile',
    redirect_uri:  REDIRECT_URI,
  });
  window.location.href = `${COGNITO_DOMAIN}/login?${params}`;
}

export async function exchangeCode(code: string): Promise<boolean> {
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) return false;
  const data = await res.json() as { id_token: string; refresh_token: string };
  saveTokens({
    id_token:      data.id_token,
    refresh_token: data.refresh_token,
    expires_at:    jwtExpiry(data.id_token),
  });
  return true;
}

export function logout() {
  clearTokens();
  const params = new URLSearchParams({
    client_id:    CLIENT_ID,
    logout_uri:   window.location.origin,
  });
  window.location.href = `${COGNITO_DOMAIN}/logout?${params}`;
}
