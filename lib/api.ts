export type Audiobook = {
  _id: string;
  title: string;
  author: string;
  audioFileUrl: string;
  durationMs: number;
  coverImageUrl: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  createdAt: string;
};

export type TranscriptSegment = {
  _id: string;
  audiobookId: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type FilterCategory =
  | 'profanity'
  | 'sexual_content'
  | 'violence'
  | 'substance_use'
  | 'religious_profanity';

export type FilterAction = 'mute' | 'skip' | 'bleep';

export type FilterTag = {
  _id: string;
  audiobookId: string;
  category: FilterCategory;
  action: FilterAction;
  severity: 1 | 2 | 3;
  startMs: number;
  endMs: number;
  originalText: string;
  replacementText?: string;
};

export type AuthSession = {
  email: string;
  token: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  let message = `Request failed with ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // Keep the status-based fallback when the API returns no JSON body.
  }
  throw new Error(message);
}

export async function apiRequest<T>(
  path: string,
  token: string | undefined,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  return parseResponse<T>(response);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function secondsToMs(value: string): number {
  return Math.round(Number(value || 0) * 1000);
}

export function msToSeconds(ms: number): string {
  return (ms / 1000).toString();
}
