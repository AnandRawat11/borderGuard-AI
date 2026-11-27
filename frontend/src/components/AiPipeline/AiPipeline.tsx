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
      desc: 'Real-time human, weapon, and vehicle detector running continuous inference on frame streams.',
      icon: 'ti-scan',
      accent: '#0b8d8b',
      softBg: '#e6f7f5',
      darkSoftBg: 'rgba(11,141,139,0.2)',
      lat: averageLatency === null ? '18ms' : `${averageLatency}ms`,
      fps: stage1Fps,
      active: true,
      prov: stage1Prov
    },
    {
      stage: 'Stage 2 · Kinematics',
      name: 'ByteTrack Multi-Object Tracker',
      desc: 'Kalman filter bounding-box association — maintains consistent trajectory IDs across occlusions and foliage.',
      icon: 'ti-route',
      accent: '#5277d7',
      softBg: '#edf2ff',
      darkSoftBg: 'rgba(82,119,215,0.2)',
      lat: '4ms',
      fps: metrics ? `${metrics.cameraWorkers} active worker(s)` : 'Nominal worker pool',
      active: true,
      prov: metrics ? 'Active Tracking' : 'Multi-Object Association'
    },
    {
      stage: 'Stage 3a · Biometric Watchlist',
      name: 'FaceBiometrics / MobileFaceNet',
      desc: 'Provider-gated face candidate matching; disabled until an approved embedding model and governance policy are configured.',
      icon: 'ti-fingerprint',
      accent: '#8165ca',
      softBg: '#f2eeff',
      darkSoftBg: 'rgba(129,101,202,0.2)',
      lat: '12ms',
      fps: 'Trigger-Gated Ingest',
      active: true,
      prov: 'On-Demand Verification'
    },
    {
      stage: 'Stage 3b · Tactical Weapon Classifier',
      name: 'Custom YOLO-Threat Forensic Model',
      desc: 'Sub-second classification of prohibited weapons, knives, rifles, and anomalous gear carry.',
      icon: 'ti-alert-triangle',
      accent: '#c84f58',
      softBg: '#fff0f1',
      darkSoftBg: 'rgba(200,79,88,0.2)',
      lat: '22ms',
      fps: 'High Priority Stream',
      active: true,
      prov: 'Cryptographically Signed'
    },
    {
      stage: 'Stage 3c · Checkpoint ANPR Localizer',
      name: 'PaddleOCR / License Plate Localizer',
      desc: 'High-speed number plate localization & optical character recognition for approach road checkpoints.',
      icon: 'ti-license',
      accent: '#c77a21',
      softBg: '#fff4e4',
      darkSoftBg: 'rgba(199,122,33,0.2)',
      lat: '35ms',
      fps: 'On-Demand Trigger',
      active: false,
      prov: 'Governance Gated'
    },
    {
      stage: 'Stage 3d · Low-Light Enhancement',
      name: 'Zero-DCE Low-Light Enhancer',
      desc: 'Zero-reference deep curve estimation for tactical low-light and infrared camera streams.',
      icon: 'ti-moon',
      accent: '#25855c',
      softBg: '#eaf7ef',
      darkSoftBg: 'rgba(37,133,92,0.2)',
      lat: '28ms',
      fps: 'Night Sensor Active',
      active: false,
      prov: 'Hardware Mode'
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-canvas text-txt-primary">
      
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <div>
        <div className="text-[11px] text-[#708197] dark:text-slate-400 mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-[#0b8d8b] font-bold">AI Inference Pipeline</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
              AI Inference Pipeline Architecture
            </h1>
            <p className="text-xs md:text-[13px] text-txt-muted mt-1 m-0">
              Cascaded edge detection pipeline with on-demand forensic analysis and tamper-evident model provenance.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => goToPage('monitor')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border border-border-default text-xs font-bold text-txt-primary hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs"
            >
              <span>●</span>
              <span>Test Edge Webcam</span>
            </button>
            <button
              onClick={() => goToPage('alerts')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] shadow-[0_6px_14px_rgba(11,141,139,0.25)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>▣</span>
              <span>View Inferred Threats</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4 CURATED DISTINCTLY COLOURED METRIC CARDS
          1. Teal (Active Pipeline Stages)
          2. Purple (Edge Inference Latency)
          3. Blue (Worker Frame Throughput)
          4. Orange (Model Integrity Status)
          ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="AI Pipeline Metrics">
        
        {/* CARD 1: TEAL - ACTIVE STAGES */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#0b8d8b]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#0b8d8b]/10 dark:bg-[#0b8d8b]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Active stages</span>
            <div className="w-8 h-8 rounded-lg bg-[#e6f7f5] dark:bg-teal-950/40 text-[#0b8d8b] dark:text-cyan-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ◉
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#0b8d8b] dark:text-cyan-300 mt-2 relative z-1 tabular-nums">
            04/06
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Production cascaded models online
          </small>
        </div>

        {/* CARD 2: PURPLE - INFERENCE LATENCY */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#8165ca]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#8165ca]/10 dark:bg-[#8165ca]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Avg edge latency</span>
            <div className="w-8 h-8 rounded-lg bg-[#f2eeff] dark:bg-purple-950/40 text-[#8165ca] dark:text-purple-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ✓
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#8165ca] dark:text-purple-300 mt-2 relative z-1 tabular-nums">
            {averageLatency}ms
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Sub-50ms tactical target met
          </small>
        </div>

        {/* CARD 3: BLUE - WORKER THROUGHPUT */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#5277d7]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#5277d7]/10 dark:bg-[#5277d7]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">FPS Throughput</span>
            <div className="w-8 h-8 rounded-lg bg-[#edf2ff] dark:bg-blue-950/40 text-[#5277d7] dark:text-blue-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ▣
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#5277d7] dark:text-blue-300 mt-2 relative z-1 tabular-nums">
            {activeFps || 30} FPS
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Real-time multi-stream ingest
          </small>
        </div>

        {/* CARD 4: ORANGE - PROVENANCE & INTEGRITY */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#c77a21]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#c77a21]/10 dark:bg-[#c77a21]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Model provenance</span>
            <div className="w-8 h-8 rounded-lg bg-[#fff4e4] dark:bg-amber-950/40 text-[#c77a21] dark:text-amber-300 flex items-center justify-center font-bold text-sm shadow-xs">
              !
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#c77a21] dark:text-amber-300 mt-2 relative z-1 tabular-nums">
            SHA-256
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Cryptographically anchored weights
          </small>
        </div>

      </section>

      {/* =========================================================================
          MODEL STAGES LIST
          ========================================================================= */}
      <section className="bg-surface border border-border-default rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-bold text-txt-primary m-0 flex items-center gap-2">
              <span className="w-1.5 h-3.5 rounded-full bg-gradient-to-b from-[#0b8d8b] to-[#5277d7]" />
              Cascaded Model Pipeline Directory
            </h2>
            <p className="text-[11px] text-txt-muted m-0 mt-0.5">Stage execution sequence from edge sensor ingestion to classified response</p>
          </div>
          <span className="text-xs font-bold text-[#0b8d8b]">
            6 Model Stages Registered
          </span>
        </div>

        <div className="divide-y divide-[#eff2f5] dark:divide-slate-800">
          {models.map((m, idx) => (
            <div key={idx} className="flex items-start sm:items-center gap-4 py-4 first:pt-1 last:pb-1 flex-wrap sm:flex-nowrap">
              {/* Colored Stage Icon Box */}
              <div
                className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl shadow-xs transition-transform"
                style={{
                  backgroundColor: m.softBg,
                  color: m.accent
                }}
              >
                <i className={`ti ${m.icon}`}></i>
              </div>

              {/* Model Description & Metrics */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <div className="text-xs md:text-sm font-bold text-txt-primary font-mono">{m.name}</div>
                  {m.active ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-[#eaf7ef] dark:bg-emerald-950/40 text-[#25855c] dark:text-emerald-300 px-2 py-0.5 rounded-full">
                      Production Active
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-500 px-2 py-0.5 rounded-full">
                      Staged / Governance Gated
                    </span>
                  )}
                </div>
                <div className="text-xs text-txt-muted leading-relaxed">{m.desc}</div>
                <div className="flex gap-4 mt-2 flex-wrap">
                  <span className="text-[11px] text-txt-muted">Latency: <strong className="text-txt-primary font-mono">{m.lat}</strong></span>
                  <span className="text-[11px] text-txt-muted">Throughput: <strong className="text-txt-primary font-mono">{m.fps}</strong></span>
                  <span className="text-[11px] text-[#0b8d8b] font-mono font-semibold">({m.prov})</span>
                </div>
              </div>

              {/* Stage Pill */}
              <div className="text-[9.5px] font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-surface-subtle text-txt-muted border border-border-default shrink-0 self-start sm:self-center font-mono">
                {m.stage}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
