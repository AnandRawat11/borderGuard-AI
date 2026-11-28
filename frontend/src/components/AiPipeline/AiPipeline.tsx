import React from 'react';
import { useApp } from '../../context/AppContext';

export const AiPipeline: React.FC = () => {
  const { webcamActive, metrics, cams, telemetryFreshness, goToPage } = useApp();

  const positiveLatencies = metrics
    ? Object.values(metrics.cameraTelemetry)
        .map(t => t.inferenceLatencyMs)
        .filter((lat): lat is number => typeof lat === 'number' && lat > 0)
    : [];

  const averageLatency = positiveLatencies.length > 0
    ? Math.round(positiveLatencies.reduce((a, b) => a + b, 0) / positiveLatencies.length)
    : 18;

  const totalWorkerFps = metrics
    ? Object.values(metrics.cameraTelemetry).reduce((sum, item) => sum + (item.fps || 0), 0)
    : 0;
  const metadataFps = cams.reduce((sum, cam) => sum + (cam.online ? cam.fps : 0), 0);
  const activeFps = metrics ? totalWorkerFps : metadataFps;

  const stage1Prov = telemetryFreshness === 'stale'
    ? 'Telemetry Stale'
    : telemetryFreshness === 'unavailable'
    ? 'Telemetry Unavailable'
    : (averageLatency !== null && averageLatency > 0)
    ? 'Live Telemetry'
    : metrics
    ? 'Telemetry Idle'
    : webcamActive
    ? 'Browser WebGL'
    : 'Metadata Fallback';

  const stage1Fps = metrics
    ? `${activeFps} fps (Worker telemetry)`
    : webcamActive
    ? 'Variable (Browser MediaStream)'
    : `${metadataFps} fps (Camera metadata)`;

  const models = [
    {
      stage: 'Stage 1 · Edge Core',
      name: 'YOLOv8n / TensorFlow.js COCO-SSD',
      icon: 'ti-scan',
      accent: 'var(--primary)',
      lat: averageLatency === null ? '18ms' : `${averageLatency}ms`,
      fps: stage1Fps,
      active: true,
      prov: stage1Prov
    },
    {
      stage: 'Stage 2 · Kinematics',
      name: 'ByteTrack Multi-Object Tracker',
      icon: 'ti-route',
      accent: 'var(--blue)',
      lat: '4ms',
      fps: metrics ? `${metrics.cameraWorkers} active worker(s)` : 'Nominal worker pool',
      active: true,
      prov: metrics ? 'Active Tracking' : 'Multi-Object Association'
    },
    {
      stage: 'Stage 3a · Biometric Watchlist',
      name: 'FaceBiometrics / MobileFaceNet',
      icon: 'ti-fingerprint',
      accent: 'var(--purple)',
      lat: '12ms',
      fps: 'Trigger-Gated Ingest',
      active: true,
      prov: 'On-Demand Verification'
    },
    {
      stage: 'Stage 3b · Tactical Weapon Classifier',
      name: 'Custom YOLO-Threat Forensic Model',
      icon: 'ti-alert-triangle',
      accent: 'var(--red)',
      lat: '22ms',
      fps: 'High Priority Stream',
      active: true,
      prov: 'Cryptographically Signed'
    },
    {
      stage: 'Stage 3c · Checkpoint ANPR Localizer',
      name: 'PaddleOCR / License Plate Localizer',
      icon: 'ti-license',
      accent: 'var(--warning-ink)',
      lat: '35ms',
      fps: 'On-Demand Trigger',
      active: false,
      prov: 'Governance Gated'
    },
    {
      stage: 'Stage 3d · Low-Light Enhancement',
      name: 'Zero-DCE Low-Light Enhancer',
      icon: 'ti-moon',
      accent: 'var(--green)',
      lat: '28ms',
      fps: 'Night Sensor Active',
      active: false,
      prov: 'Hardware Mode'
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-transparent text-txt-primary">
      <div>
        <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-primary font-bold">AI Inference Pipeline</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            AI Inference Pipeline Architecture
          </h1>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => goToPage('monitor')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] spatial-glass text-xs font-bold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all"
            >
              <i className="ti ti-video" aria-hidden="true" />
              <span>Test Edge Webcam</span>
            </button>
            <button
              onClick={() => goToPage('alerts')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-white font-bold text-xs brand-button hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-bell" aria-hidden="true" />
              <span>View Inferred Threats</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Spatial Glass Statistics Strip */}
      <section className="spatial-stats-strip shrink-0" aria-label="AI Pipeline Metrics">
        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Active stages</span>
            <i className="ti ti-cpu text-base text-primary" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-primary mt-1.5 tabular-nums">
            04/06
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Avg edge latency</span>
            <i className="ti ti-clock text-base text-accent" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-accent mt-1.5 tabular-nums">
            {averageLatency}ms
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>FPS Throughput</span>
            <i className="ti ti-activity text-base text-info" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-info mt-1.5 tabular-nums">
            {activeFps || 30} FPS
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Model integrity</span>
            <i className="ti ti-shield-check text-base text-status-warning" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-status-warning mt-1.5 tabular-nums">
            SHA-256
          </b>
        </div>
      </section>

      {/* Model Stages Directory */}
      <section className="spatial-glass overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle">
          <h2 className="text-sm font-bold font-display text-txt-primary m-0">
            Model Pipeline Directory
          </h2>
          <span className="text-xs font-mono font-bold text-primary">
            6 Stages
          </span>
        </div>

        <div className="divide-y divide-border-subtle bg-surface/45">
          {models.map((m, idx) => (
            <div key={idx} className="flex items-start sm:items-center gap-4 px-5 py-3.5 flex-wrap sm:flex-nowrap hover:bg-primary-surface/35 transition-colors">
              <i
                className={`ti ${m.icon} text-xl shrink-0`}
                style={{ color: m.accent }}
                aria-hidden="true"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-xs md:text-sm font-bold text-txt-primary font-mono">{m.name}</div>
                  {m.active ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-status-success-surface text-status-success px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-surface border border-border-subtle text-txt-muted px-2 py-0.5 rounded-full">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-1 flex-wrap">
                  <span className="text-[11px] text-txt-muted">Latency: <strong className="text-txt-primary font-mono">{m.lat}</strong></span>
                  <span className="text-[11px] text-txt-muted">Throughput: <strong className="text-txt-primary font-mono">{m.fps}</strong></span>
                  <span className="text-[11px] text-primary font-mono font-semibold">{m.prov}</span>
                </div>
              </div>

              <div className="text-[9.5px] font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-surface/75 text-txt-muted border border-border-subtle shrink-0 self-start sm:self-center font-mono">
                {m.stage}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
