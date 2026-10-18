export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:8000`
).replace(/\/$/, '');

export type ConsentBasis = 'historical_figure' | 'myself' | 'documented_consent' | 'ai_generated';

export interface Avatar {
  id: string;
  name: string;
  tagline: string;
  greeting: string;
  voice: string;
  portrait_url: string;
  voice_sample: string | null;
  face_engine: string;
  consent_basis: ConsentBasis;
  seed: boolean;
}

export interface Voice {
  id: string;
  label: string;
}

export interface PersonaDraft {
  persona_prompt: string;
  greeting: string;
  tagline: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, init);
  } catch {
    throw new Error(`Backend unreachable at ${BACKEND_URL}. Is server.py running?`);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      // Keep the status text.
    }
    throw new Error(detail);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const portraitSrc = (avatar: Avatar) => `${BACKEND_URL}${avatar.portrait_url}`;

export const api = {
  listAvatars: () => request<Avatar[]>('/avatars'),
  listVoices: () => request<Voice[]>('/voices'),
  createAvatar: (form: FormData) => request<Avatar>('/avatars', { method: 'POST', body: form }),
  deleteAvatar: (id: string) => request<void>(`/avatars/${id}`, { method: 'DELETE' }),
  draftPersona: (name: string, notes: string) =>
    request<PersonaDraft>('/avatars/persona-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes }),
    }),
  createSession: (webrtcId: string, avatarId: string) =>
    request<void>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webrtc_id: webrtcId, avatar_id: avatarId }),
    }),
  endSession: (webrtcId: string) => request<void>(`/sessions/${webrtcId}`, { method: 'DELETE' }),
};
