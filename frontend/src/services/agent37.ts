/**
 * agent37.ts – client-side API service for Agent37 intelligence integration.
 * All calls include the JWT from localStorage (same auth pattern as the rest of IBVAP).
 */

const getHost = (): string => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return window.location.hostname;
  }
  return '127.0.0.1';
};

const BASE = (import.meta as any).env?.VITE_API_BASE || `http://${getHost()}:8000`;

function resolveToken(token?: string): string | undefined {
  if (token) return token;
  try {
    const raw = localStorage.getItem('ibvap_auth');
    if (!raw) return undefined;
    const auth = JSON.parse(raw);
    return auth?.accessToken || auth?.access_token || undefined;
  } catch {
    return undefined;
  }
}

async function apiCall<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const effectiveToken = resolveToken(token);
  if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ detail: 'Non-JSON response' }));
  if (!res.ok) {
    throw new Error(data?.detail || `HTTP ${res.status}`);
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
export interface Agent37KeyStatus {
  configured: boolean;
  masked_key: string | null;
  provider?: string | null;
  base_url?: string | null;
  model?: string | null;
}

export async function getAgent37Settings(token?: string): Promise<Agent37KeyStatus> {
  return apiCall<Agent37KeyStatus>('GET', '/api/settings/agent37', token);
}

export async function saveAgent37Key(
  api_key: string,
  base_url?: string,
  model?: string,
  token?: string
): Promise<{ status: string; configured: boolean; provider?: string }> {
  return apiCall('PUT', '/api/settings/agent37', token, {
    api_key,
    base_url: base_url || undefined,
    model: model || undefined,
  });
}

export async function deleteAgent37Key(token?: string): Promise<{ status: string; configured: boolean }> {
  return apiCall('DELETE', '/api/settings/agent37', token);
}


// ─────────────────────────────────────────────────────────────────────────────
// Investigation
// ─────────────────────────────────────────────────────────────────────────────
export interface Investigation {
  summary: string;
  threat_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  timeline: { time: string; event: string }[];
  key_findings: string[];
  recommended_actions: string[];
  confidence: number;
  notes: string;
}

export interface InvestigationResult {
  alert_id: string;
  investigation: Investigation;
  correlated_count: number;
}

export async function investigateAlert(alert_id: string, token?: string): Promise<InvestigationResult> {
  return apiCall<InvestigationResult>('POST', '/api/ai/investigate', token, { alert_id });
}

// ─────────────────────────────────────────────────────────────────────────────
// Briefing
// ─────────────────────────────────────────────────────────────────────────────
export interface Briefing {
  executive_summary: string;
  threat_overview: 'QUIET' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  hotspot_cameras: string[];
  alert_breakdown: Record<string, number>;
  key_incidents: { id: string; type: string; camera: string; significance: string }[];
  patterns_observed: string[];
  recommended_priorities: string[];
  confidence: number;
  period: string;
}

export interface BriefingResult {
  period_hours: number;
  alert_count: number;
  type_counts: Record<string, number>;
  sev_counts: Record<string, number>;
  briefing: Briefing;
}

export async function getSurveillanceBriefing(hours_back: number, token?: string): Promise<BriefingResult> {
  return apiCall<BriefingResult>('POST', '/api/ai/briefing', token, { hours_back });
}
