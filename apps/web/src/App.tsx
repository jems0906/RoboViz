import { useEffect, useMemo, useRef, useState } from 'react';
import { buildWebSocketUrl, exportRecording, fetchRecordings, fetchReplayEvents, fetchRobots } from './api';
import { PointCloudView } from './PointCloudView';
import type { LiveRobotSnapshot, LiveTelemetryEvent, RecordingSummary, ReplayEvent, RobotSummary, SensorType } from './types';

type ReplayState = {
  events: ReplayEvent[];
  isPlaying: boolean;
  speed: number;
  cursorMs: number;
  durationMs: number;
};

const emptyReplayState: ReplayState = {
  events: [],
  isPlaying: false,
  speed: 1,
  cursorMs: 0,
  durationMs: 0
};

function buildDemoLidarPoints(tick: number) {
  const points: Array<{ x: number; y: number; z: number; intensity: number }> = [];
  const phase = tick * 0.11;

  for (let i = 0; i < 850; i += 1) {
    const ring = 2.2 + (i % 28) * 0.33;
    const theta = (i * 0.21) + phase;
    const wave = Math.sin(theta * 0.6 + phase) * 0.35;
    const x = Math.cos(theta) * ring + Math.sin(i * 0.13) * 0.22;
    const z = Math.sin(theta) * ring + Math.cos(i * 0.09) * 0.22;
    const y = wave + Math.sin(i * 0.05 + phase) * 0.08;
    const intensity = 0.35 + (Math.sin(theta * 1.8) + 1) * 0.3;
    points.push({ x, y, z, intensity });
  }

  return points;
}

function buildDemoCameraImageBase64(tick: number, robotName: string, colorHint: string = '#5effe3') {
  const pulse = 0.35 + ((Math.sin(tick * 0.16) + 1) / 2) * 0.55;
  const markerX = 40 + ((tick * 7) % 220);
  const markerY = 72 + Math.sin(tick * 0.12) * 22;
  const markerX2 = 200 - ((tick * 4) % 140);
  const markerY2 = 140 + Math.cos(tick * 0.09) * 30;
  const stamp = new Date().toLocaleTimeString();
  const fps = (28 + Math.floor(Math.sin(tick * 0.3) * 4)).toString();
  const conf = (0.72 + Math.sin(tick * 0.17) * 0.15).toFixed(2);
  const scanY = 20 + ((tick * 3) % 180);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1e35"/>
      <stop offset="100%" stop-color="#07111e"/>
    </linearGradient>
  </defs>
  <rect width="320" height="220" fill="url(#bg)"/>
  <rect x="0" y="${scanY}" width="320" height="2" fill="${colorHint}" opacity="0.12"/>
  <line x1="0" y1="110" x2="320" y2="110" stroke="${colorHint}" stroke-width="0.4" opacity="0.18"/>
  <line x1="160" y1="0" x2="160" y2="220" stroke="${colorHint}" stroke-width="0.4" opacity="0.18"/>
  <path d="M0 160 Q80 140 160 155 Q240 170 320 148" stroke="rgba(94,255,195,0.18)" stroke-width="28" fill="none"/>
  <path d="M0 120 Q80 108 160 118 Q240 128 320 112" stroke="rgba(61,160,255,0.14)" stroke-width="22" fill="none"/>
  <rect x="14" y="14" width="292" height="192" fill="none" stroke="${colorHint}" stroke-width="0.8" opacity="0.5"/>
  <rect x="14" y="14" width="8" height="8" fill="${colorHint}" opacity="0.7"/>
  <rect x="298" y="14" width="8" height="8" fill="${colorHint}" opacity="0.7"/>
  <rect x="14" y="198" width="8" height="8" fill="${colorHint}" opacity="0.7"/>
  <rect x="298" y="198" width="8" height="8" fill="${colorHint}" opacity="0.7"/>
  <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="10" fill="none" stroke="rgba(255,123,142,${pulse.toFixed(2)})" stroke-width="2"/>
  <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="3" fill="rgba(255,123,142,${pulse.toFixed(2)})"/>
  <rect x="${(markerX - 14).toFixed(1)}" y="${(markerY - 14).toFixed(1)}" width="28" height="28" fill="none" stroke="rgba(255,220,80,0.55)" stroke-width="1"/>
  <circle cx="${markerX2.toFixed(1)}" cy="${markerY2.toFixed(1)}" r="7" fill="none" stroke="rgba(80,220,255,0.65)" stroke-width="1.5"/>
  <text x="20" y="32" fill="${colorHint}" font-size="10" font-family="monospace" opacity="0.9">${robotName}</text>
  <text x="20" y="46" fill="#7fc8ff" font-size="10" font-family="monospace" opacity="0.8">CAM-FRONT  ${stamp}</text>
  <text x="20" y="208" fill="${colorHint}" font-size="9" font-family="monospace" opacity="0.7">CONF ${conf}  OBJ 2  ${fps}fps</text>
  <rect x="244" y="18" width="5" height="5" rx="2" fill="#f43"/>
  <text x="254" y="26" fill="#f55" font-size="9" font-family="monospace">REC</text>
</svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Active';
}

function buildReplaySnapshots(events: ReplayEvent[], cursorMs: number) {
  if (!events.length) {
    return new Map<string, Partial<Record<SensorType, ReplayEvent>>>();
  }

  const startMs = new Date(events[0].ts).getTime();
  const cursorTime = startMs + cursorMs;
  const state = new Map<string, Partial<Record<SensorType, ReplayEvent>>>();

  for (const event of events) {
    if (new Date(event.ts).getTime() > cursorTime) {
      break;
    }
    const robotState = state.get(event.robot_id) ?? {};
    robotState[event.sensor_type] = event;
    state.set(event.robot_id, robotState);
  }

  return state;
}

export function App() {
  const [robots, setRobots] = useState<RobotSummary[]>([]);
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [liveSnapshots, setLiveSnapshots] = useState<Record<string, LiveRobotSnapshot>>({});
  const [selectedRecordings, setSelectedRecordings] = useState<string[]>([]);
  const [replay, setReplay] = useState<ReplayState>(emptyReplayState);
  const [filters, setFilters] = useState({ robotId: '', sensorType: '', from: '', to: '', anomalyOnly: false });
  const [statusMessage, setStatusMessage] = useState('Connecting to live telemetry...');
  const frameTimeRef = useRef<number | null>(null);
  const demoReplayInitializedRef = useRef(false);
  const [demoTick, setDemoTick] = useState(0);

  useEffect(() => {
    const ws = new WebSocket(buildWebSocketUrl('/ws/live'));

    ws.onopen = () => {
      setStatusMessage('Live telemetry connected');
    };

    ws.onmessage = (message) => {
      const payload = JSON.parse(message.data);
      if (payload.type === 'live.snapshot') {
        const next: Record<string, LiveRobotSnapshot> = {};
        for (const robot of payload.robots as LiveRobotSnapshot[]) {
          next[robot.robot.robotId] = robot;
        }
        setLiveSnapshots(next);
      }
      if (payload.type === 'live.telemetry') {
        setLiveSnapshots((current) => ({
          ...current,
          [payload.snapshot.robot.robotId]: payload.snapshot as LiveRobotSnapshot
        }));
      }
      if (payload.type === 'robot.presence') {
        setLiveSnapshots((current) => ({
          ...current,
          [payload.robot.robot.robotId]: payload.robot as LiveRobotSnapshot
        }));
      }
    };

    ws.onclose = () => {
      setStatusMessage('Live telemetry disconnected');
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    async function load() {
      const [robotsResponse, recordingsResponse] = await Promise.all([
        fetchRobots(),
        fetchRecordings({
          robotId: filters.robotId || undefined,
          sensorType: filters.sensorType || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          anomalyOnly: filters.anomalyOnly ? 'true' : undefined,
          limit: '200'
        })
      ]);
      setRobots(robotsResponse.robots);
      setRecordings(recordingsResponse.recordings);
    }

    load().catch((error) => setStatusMessage(error instanceof Error ? error.message : 'Failed to load dashboard data'));
  }, [filters]);

  useEffect(() => {
    if (!replay.isPlaying || replay.events.length === 0) {
      frameTimeRef.current = null;
      return;
    }

    let rafId = 0;
    const tick = (time: number) => {
      const previous = frameTimeRef.current ?? time;
      const delta = time - previous;
      frameTimeRef.current = time;
      setReplay((current) => {
        const nextCursor = Math.min(current.cursorMs + delta * current.speed, current.durationMs);
        return {
          ...current,
          cursorMs: nextCursor,
          isPlaying: nextCursor < current.durationMs
        };
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [replay.isPlaying, replay.events.length]);

  const shouldUseDemo = robots.length === 0 && recordings.length === 0 && Object.keys(liveSnapshots).length === 0;

  useEffect(() => {
    if (!shouldUseDemo) {
      return;
    }

    const interval = setInterval(() => {
      setDemoTick((current) => current + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [shouldUseDemo]);

  const nowIso = new Date().toISOString();

  // ── Demo fleet ────────────────────────────────────────────────────────────
  const DEMO_FLEET = useMemo(() => [
    { id: 'rvz-scout-07',   name: 'Warehouse Scout 07',  location: 'Aisle 3 / Dock B',     status: 'online'   as const, color: '#5effe3', phase: 0.00 },
    { id: 'rvz-patrol-12',  name: 'Security Patrol 12',  location: 'Zone C / Entry Gate',   status: 'degraded' as const, color: '#ffd45e', phase: 1.57 },
    { id: 'rvz-loader-03',  name: 'Cargo Loader 03',     location: 'Loading Bay 2',         status: 'online'   as const, color: '#a78bfa', phase: 3.14 },
  ], []);

  const demoLiveSnapshots = useMemo<Record<string, LiveRobotSnapshot>>(() => {
    const snapshots: Record<string, LiveRobotSnapshot> = {};
    for (const robot of DEMO_FLEET) {
      const t = demoTick * 0.5 + robot.phase;
      const x = Math.sin(t * 0.09) * 4.2;
      const y = Math.cos(t * 0.06) * 2.7;
      const yaw   = Math.sin(t * 0.11) * 24 + 8;
      const pitch = Math.cos(t * 0.07) * 4;
      const recId = `rec-demo-live-${robot.id}`;
      snapshots[robot.id] = {
        robot: { robotId: robot.id, name: robot.name, location: robot.location, status: robot.status },
        recordingId: recId,
        lastUpdatedAt: nowIso,
        sensors: {
          lidar: {
            robotId: robot.id, recordingId: recId, sensorType: 'lidar',
            timestamp: nowIso, sequence: demoTick, anomaly: false,
            payload: { points: buildDemoLidarPoints(demoTick + Math.floor(robot.phase * 10)) }
          },
          camera: {
            robotId: robot.id, recordingId: recId, sensorType: 'camera',
            timestamp: nowIso, sequence: demoTick, anomaly: false,
            payload: { imageBase64: buildDemoCameraImageBase64(demoTick, robot.name, robot.color) }
          },
          imu: {
            robotId: robot.id, recordingId: recId, sensorType: 'imu',
            timestamp: nowIso, sequence: demoTick, anomaly: robot.status === 'degraded',
            payload: { yaw, pitch, roll: Math.sin(t * 0.05) * 2 }
          },
          odometry: {
            robotId: robot.id, recordingId: recId, sensorType: 'odometry',
            timestamp: nowIso, sequence: demoTick, anomaly: false,
            payload: { x, y, vx: Math.cos(t * 0.11) * 0.6, vy: Math.sin(t * 0.08) * 0.4 }
          }
        }
      };
    }
    return snapshots;
  }, [demoTick, nowIso, DEMO_FLEET]);

  const demoRobots = useMemo<RobotSummary[]>(() =>
    DEMO_FLEET.map((r) => ({
      robot_id: r.id, name: r.name, location: r.location,
      status: r.status, metadata: { profile: 'simulated' }, last_seen_at: nowIso
    })), [DEMO_FLEET, nowIso]);

  const demoRecordings = useMemo<RecordingSummary[]>(() => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    return [
      {
        id: `rec-demo-live-${DEMO_FLEET[0].id}`,
        robot_id: DEMO_FLEET[0].id, robot_name: DEMO_FLEET[0].name, robot_location: DEMO_FLEET[0].location,
        started_at: ago(21 * 60_000), ended_at: null,
        sensor_types: ['camera', 'lidar', 'imu', 'odometry'],
        file_size_bytes: 164_321_024, status: 'recording',
        storage_prefix: `demo/${DEMO_FLEET[0].id}/live`
      },
      {
        id: `rec-demo-live-${DEMO_FLEET[1].id}`,
        robot_id: DEMO_FLEET[1].id, robot_name: DEMO_FLEET[1].name, robot_location: DEMO_FLEET[1].location,
        started_at: ago(8 * 60_000), ended_at: null,
        sensor_types: ['camera', 'imu', 'odometry'],
        file_size_bytes: 43_008_512, status: 'recording',
        storage_prefix: `demo/${DEMO_FLEET[1].id}/live`
      },
      {
        id: `rec-demo-live-${DEMO_FLEET[2].id}`,
        robot_id: DEMO_FLEET[2].id, robot_name: DEMO_FLEET[2].name, robot_location: DEMO_FLEET[2].location,
        started_at: ago(44 * 60_000), ended_at: null,
        sensor_types: ['lidar', 'imu', 'odometry'],
        file_size_bytes: 91_750_400, status: 'recording',
        storage_prefix: `demo/${DEMO_FLEET[2].id}/live`
      },
      {
        id: 'rec-demo-archive-044',
        robot_id: DEMO_FLEET[0].id, robot_name: DEMO_FLEET[0].name, robot_location: DEMO_FLEET[0].location,
        started_at: ago(3.2 * 3_600_000), ended_at: ago(2.7 * 3_600_000),
        sensor_types: ['camera', 'lidar', 'imu', 'odometry'],
        file_size_bytes: 89_214_592, status: 'completed',
        storage_prefix: `demo/${DEMO_FLEET[0].id}/archive-044`
      },
      {
        id: 'rec-demo-archive-041',
        robot_id: DEMO_FLEET[2].id, robot_name: DEMO_FLEET[2].name, robot_location: DEMO_FLEET[2].location,
        started_at: ago(7.1 * 3_600_000), ended_at: ago(6.5 * 3_600_000),
        sensor_types: ['lidar', 'imu', 'odometry'],
        file_size_bytes: 54_525_952, status: 'completed',
        storage_prefix: `demo/${DEMO_FLEET[2].id}/archive-041`
      },
    ];
  }, [DEMO_FLEET]);

  // Demo replay events – synthetic 60-second window so the scrubber is usable
  const demoReplayEvents = useMemo<ReplayEvent[]>(() => {
    const baseMs = Date.now() - 60_000;
    const events: ReplayEvent[] = [];
    let seq = 0;
    const robotId = DEMO_FLEET[0].id;
    const recordingId = `rec-demo-live-${robotId}`;
    for (let ms = 0; ms <= 60_000; ms += 500) {
      const ts = new Date(baseMs + ms).toISOString();
      const t = ms / 1000;
      events.push({ id: seq++, recording_id: recordingId, robot_id: robotId, sensor_type: 'imu', ts, sequence: String(seq), anomaly: false,
        payload: { yaw: Math.sin(t * 0.4) * 24 + 8, pitch: Math.cos(t * 0.3) * 4 } });
      events.push({ id: seq++, recording_id: recordingId, robot_id: robotId, sensor_type: 'odometry', ts, sequence: String(seq), anomaly: false,
        payload: { x: Math.sin(t * 0.09) * 4.2, y: Math.cos(t * 0.06) * 2.7 } });
      if (ms % 2000 === 0) {
        events.push({ id: seq++, recording_id: recordingId, robot_id: robotId, sensor_type: 'lidar', ts, sequence: String(seq), anomaly: false,
          payload: { points: buildDemoLidarPoints(Math.floor(t * 2)) } });
      }
    }
    return events;
  }, [DEMO_FLEET]);

  const displayRobots = shouldUseDemo ? demoRobots : robots;
  const displayRecordings = shouldUseDemo ? demoRecordings : recordings;
  const displayLiveSnapshots = shouldUseDemo ? demoLiveSnapshots : liveSnapshots;
  const displayStatusMessage = shouldUseDemo
    ? `Demo — ${DEMO_FLEET.length} robots simulated`
    : statusMessage;

  useEffect(() => {
    if (!shouldUseDemo || demoReplayInitializedRef.current || demoRecordings.length === 0 || demoReplayEvents.length === 0) {
      return;
    }

    const primaryRecordingId = demoRecordings[0].id;
    const start = new Date(demoReplayEvents[0].ts).getTime();
    const end = new Date(demoReplayEvents[demoReplayEvents.length - 1].ts).getTime();

    setSelectedRecordings([primaryRecordingId]);
    setReplay({
      events: demoReplayEvents,
      isPlaying: false,
      speed: 1,
      cursorMs: 0,
      durationMs: end - start
    });
    setStatusMessage(`Loaded ${demoReplayEvents.length} demo replay events (auto)`);
    demoReplayInitializedRef.current = true;
  }, [shouldUseDemo, demoRecordings, demoReplayEvents]);

  const replaySnapshots = useMemo(() => buildReplaySnapshots(replay.events, replay.cursorMs), [replay.events, replay.cursorMs]);
  const activeRobotId = selectedRecordings.length
    ? displayRecordings.find((recording) => recording.id === selectedRecordings[0])?.robot_id ?? displayRobots[0]?.robot_id
    : displayRobots[0]?.robot_id;

  const activeLiveSnapshot = activeRobotId ? displayLiveSnapshots[activeRobotId] : undefined;
  const activeReplaySnapshot = activeRobotId ? replaySnapshots.get(activeRobotId) : undefined;
  const lidarPoints = ((activeReplaySnapshot?.lidar?.payload.points as Array<{ x: number; y: number; z: number; intensity?: number }>)
    ?? (activeLiveSnapshot?.sensors.lidar?.payload.points as Array<{ x: number; y: number; z: number; intensity?: number }>)
    ?? []);
  const cameraImage = (activeReplaySnapshot?.camera?.payload.imageBase64 as string | undefined)
    ?? (activeLiveSnapshot?.sensors.camera?.payload.imageBase64 as string | undefined);
  const cameraSrc = cameraImage?.startsWith('data:') ? cameraImage : (cameraImage ? `data:image/png;base64,${cameraImage}` : undefined);
  const imuPayload = (activeReplaySnapshot?.imu?.payload ?? activeLiveSnapshot?.sensors.imu?.payload ?? {}) as Record<string, number>;
  const odometryPayload = (activeReplaySnapshot?.odometry?.payload ?? activeLiveSnapshot?.sensors.odometry?.payload ?? {}) as Record<string, number>;

  async function handleReplayLoad() {
    if (!selectedRecordings.length) {
      setStatusMessage('Select at least one recording to load replay');
      return;
    }

    // In demo mode, use synthetic events instead of hitting the API
    if (shouldUseDemo) {
      const events = demoReplayEvents;
      const start = new Date(events[0].ts).getTime();
      const end = new Date(events[events.length - 1].ts).getTime();
      setReplay({ events, isPlaying: false, speed: 1, cursorMs: 0, durationMs: end - start });
      setStatusMessage(`Loaded ${events.length} demo replay events (60s window)`);
      return;
    }

    const response = await fetchReplayEvents(selectedRecordings);
    if (!response.events.length) {
      setStatusMessage('No replay data available for the selected recordings');
      return;
    }

    const start = new Date(response.events[0].ts).getTime();
    const end = new Date(response.events[response.events.length - 1].ts).getTime();
    setReplay({
      events: response.events,
      isPlaying: false,
      speed: 1,
      cursorMs: 0,
      durationMs: end - start
    });
    setStatusMessage(`Loaded ${response.events.length} replay events`);
  }

  function toggleRecording(recordingId: string) {
    setSelectedRecordings((current) => current.includes(recordingId)
      ? current.filter((item) => item !== recordingId)
      : [...current, recordingId]);
  }

  async function handleExport(format: 'jsonl' | 'parquet' | 'tfrecord') {
    if (selectedRecordings.length !== 1) {
      setStatusMessage('Select exactly one recording for export');
      return;
    }

    const recordingId = selectedRecordings[0];
    const result = await exportRecording(recordingId, format);
    if (result instanceof Blob) {
      const url = URL.createObjectURL(result);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${recordingId}.${format === 'jsonl' ? 'jsonl' : 'tfrecord'}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Downloaded ${format} export for ${recordingId}`);
      return;
    }

    setStatusMessage(`Parquet export materialized at ${result.filePath}`);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">RoboViz</p>
          <h1>Real-time robot observability and synchronized replay</h1>
          <p className="hero-copy">
            Live sensor streams, indexed recordings, anomaly search, and multi-robot timeline playback in one cockpit.
          </p>
        </div>
        <div className="hero-metrics">
          <article>
            <span>{Object.keys(displayLiveSnapshots).length}</span>
            <label>Live robots</label>
          </article>
          <article>
            <span>{displayRecordings.length}</span>
            <label>Indexed recordings</label>
          </article>
          <article>
            <span>{replay.events.length}</span>
            <label>Replay events loaded</label>
          </article>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel feed-panel">
          <div className="panel-head">
            <h2>Lidar volume</h2>
            <p>{activeRobotId ? `Robot ${activeRobotId}` : 'Waiting for telemetry'}</p>
          </div>
          <PointCloudView points={lidarPoints} />
        </section>

        <section className="panel camera-panel">
          <div className="panel-head">
            <h2>Camera feed</h2>
            <p>{cameraImage ? 'Timestamp-aligned frame' : 'No frame yet'}</p>
          </div>
          {cameraSrc ? <img alt="Robot camera" src={cameraSrc} className="camera-feed" /> : <div className="empty-state">Camera frames appear here</div>}
          <div className="telemetry-strip">
            <div>
              <span>IMU</span>
              <strong>{Number(imuPayload.yaw ?? 0).toFixed(2)} yaw / {Number(imuPayload.pitch ?? 0).toFixed(2)} pitch</strong>
            </div>
            <div>
              <span>Odometry</span>
              <strong>{Number(odometryPayload.x ?? 0).toFixed(2)}m, {Number(odometryPayload.y ?? 0).toFixed(2)}m</strong>
            </div>
          </div>
        </section>

        <section className="panel robots-panel">
          <div className="panel-head">
            <h2>Fleet status</h2>
            <p>{displayStatusMessage}</p>
          </div>
          <div className="robot-list">
            {displayRobots.map((robot) => {
              const snapshot = displayLiveSnapshots[robot.robot_id];
              return (
                <article className="robot-card" key={robot.robot_id}>
                  <div>
                    <h3>{robot.name}</h3>
                    <p>{robot.location}</p>
                  </div>
                  <span className={`status-chip ${snapshot?.robot.status ?? robot.status}`}>{snapshot?.robot.status ?? robot.status}</span>
                  <small>Last seen {formatTimestamp(robot.last_seen_at)}</small>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel replay-panel">
          <div className="panel-head">
            <h2>Replay controls</h2>
            <p>Synced timeline across {selectedRecordings.length || 0} recording(s)</p>
          </div>
          <div className="controls-row">
            <button onClick={() => setReplay((current) => ({ ...current, isPlaying: !current.isPlaying }))} type="button">
              {replay.isPlaying ? 'Pause' : 'Play'}
            </button>
            <button onClick={handleReplayLoad} type="button">Load replay</button>
            <button onClick={() => setReplay((current) => ({ ...current, cursorMs: 0, isPlaying: false }))} type="button">Reset</button>
            <select
              aria-label="Replay speed"
              value={replay.speed}
              onChange={(event) => setReplay((current) => ({ ...current, speed: Number(event.target.value) }))}
            >
              {[0.25, 0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
            </select>
          </div>
          <input
            aria-label="Replay timeline"
            className="timeline"
            type="range"
            min={0}
            max={Math.max(replay.durationMs, 1)}
            step={100}
            value={Math.min(replay.cursorMs, replay.durationMs)}
            onChange={(event) => setReplay((current) => ({ ...current, cursorMs: Number(event.target.value), isPlaying: false }))}
          />
          <p className="timeline-caption">{Math.round(replay.cursorMs)}ms / {Math.round(replay.durationMs)}ms</p>
        </section>

        <section className="panel recordings-panel">
          <div className="panel-head">
            <h2>Recording index</h2>
            <p>Filter by robot, date, sensor, and anomalies</p>
          </div>
          <div className="filters-grid">
            <input placeholder="Robot ID" value={filters.robotId} onChange={(event) => setFilters((current) => ({ ...current, robotId: event.target.value }))} />
            <input placeholder="Sensor type" value={filters.sensorType} onChange={(event) => setFilters((current) => ({ ...current, sensorType: event.target.value }))} />
            <input
              aria-label="Start date"
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            />
            <input
              aria-label="End date"
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            />
            <label className="anomaly-toggle">
              <input type="checkbox" checked={filters.anomalyOnly} onChange={(event) => setFilters((current) => ({ ...current, anomalyOnly: event.target.checked }))} />
              Anomaly-only
            </label>
          </div>
          <div className="export-row">
            <button onClick={() => handleExport('jsonl')} type="button">Export JSONL</button>
            <button onClick={() => handleExport('parquet')} type="button">Export Parquet</button>
            <button onClick={() => handleExport('tfrecord')} type="button">Export TFRecord</button>
          </div>
          <div className="recordings-table">
            {displayRecordings.map((recording) => (
              <label className="recording-row" key={recording.id}>
                <input type="checkbox" checked={selectedRecordings.includes(recording.id)} onChange={() => toggleRecording(recording.id)} />
                <div>
                  <strong>{recording.robot_name}</strong>
                  <span>{recording.id}</span>
                </div>
                <div>
                  <span>{formatTimestamp(recording.started_at)}</span>
                  <small>{recording.sensor_types.join(', ') || 'No sensor types yet'}</small>
                </div>
                <div>
                  <span>{recording.status}</span>
                  <small>{formatBytes(recording.file_size_bytes)}</small>
                </div>
              </label>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
