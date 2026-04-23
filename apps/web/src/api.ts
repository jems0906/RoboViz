import type { RecordingSummary, ReplayEvent, RobotSummary } from './types';

const apiBase = import.meta.env.VITE_API_BASE ?? '';

function buildUrl(path: string) {
  return `${apiBase}${path}`;
}

export function buildWebSocketUrl(path: string) {
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  const url = new URL(path, window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export async function fetchRobots() {
  const response = await fetch(buildUrl('/api/robots'));
  if (!response.ok) {
    throw new Error('Failed to load robots');
  }
  return response.json() as Promise<{ robots: RobotSummary[] }>;
}

export async function fetchRecordings(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const response = await fetch(buildUrl(`/api/recordings?${search.toString()}`));
  if (!response.ok) {
    throw new Error('Failed to load recordings');
  }
  return response.json() as Promise<{ recordings: RecordingSummary[] }>;
}

export async function fetchReplayEvents(recordingIds: string[]) {
  const response = await fetch(buildUrl(`/api/replay/events?recordingIds=${recordingIds.join(',')}`));
  if (!response.ok) {
    throw new Error('Failed to load replay events');
  }
  return response.json() as Promise<{ events: ReplayEvent[] }>;
}

export async function exportRecording(recordingId: string, format: 'jsonl' | 'parquet' | 'tfrecord') {
  const response = await fetch(buildUrl(`/api/exports/${recordingId}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ format })
  });

  if (!response.ok) {
    throw new Error('Failed to export recording');
  }

  if (format === 'parquet') {
    return response.json();
  }

  return response.blob();
}
