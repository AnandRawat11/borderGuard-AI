import React, { useEffect, useState } from 'react';
import { useApp, TYPE_META } from '../../context/AppContext';
import { getSceneSvg } from '../../services/mockScenes';
import { api } from '../../services/api';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

export const EvidenceModal: React.FC = () => {
  const { activeLightboxAlert, closeLightbox, markReviewed, cams, currentUser, showNotice } = useApp();
  const [recommendation, setRecommendation] = useState<any>(null);

  useEffect(() => {
    if (!activeLightboxAlert) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightboxAlert, closeLightbox]);

  useEffect(() => {
    if (!activeLightboxAlert) return;
    api.getAlertRecommendation(activeLightboxAlert.id, currentUser?.accessToken)
      .then(setRecommendation)
      .catch(() => null);
  }, [activeLightboxAlert, currentUser]);

  if (!activeLightboxAlert) return null;

  const a = activeLightboxAlert;
  const meta = TYPE_META[a.type] || TYPE_META.intrusion;
  const cam = cams.find(c => c.id === a.camId);
  const isThreat = a.type === 'watchlist' || a.type === 'weapon' || a.sev === 'high';
  const isDetector = (a.provenance || 'detector') === 'detector';

  const handleDownload = () => {
    const record = {
      evidenceId: a.id,
      eventType: a.type,
      detail: a.detail,
      camera: a.camName,
      location: a.location,
      confidence: a.confidence,
      severity: a.sev,
      timestamp: a.ts.toISOString(),
      provenance: isDetector ? 'Live Detector AI' : 'Simulation',
      evidenceHash: a.evidenceHash || 'SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IBVAP-Evidence-${a.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotice('success', `Forensic evidence record ${a.id} downloaded.`);
  };

  const verificationLabel = (a.reviewed || a.verificationStatus === 'officer_reviewed')
    ? 'Officer-Reviewed Alert'
    : a.type === 'weapon'
    ? (a.verificationStatus === 'potential' ? 'Potential Weapon Detection' : 'Verified AI Weapon Alert')
    : 'Verified AI Alert';

  const fields = [
    { key: 'Event Type', val: a.type === 'weapon' ? verificationLabel : meta.label },
    { key: 'Verification Status', val: verificationLabel },
    { key: 'Camera Source', val: a.camName.split('·')[0].trim() },
    { key: 'Track ID', val: a.trackId || 'N/A' },
    { key: 'AI Confidence', val: `${a.confidence}%` },
    { key: 'Supporting Hits', val: `${a.supportingDetections || 1} frames` },
    { key: 'First Detected', val: a.firstDetectedAt ? new Date(a.firstDetectedAt).toLocaleTimeString() : new Date(a.ts).toLocaleTimeString() },
    { key: 'Last Detected', val: a.lastDetectedAt ? new Date(a.lastDetectedAt).toLocaleTimeString() : new Date(a.ts).toLocaleTimeString() },
    { key: 'Severity', val: a.sev === 'high' ? 'CRITICAL' : a.sev === 'med' ? 'WARNING' : 'INFO' },
    { key: 'Provenance', val: isDetector ? 'Live Edge Detector' : 'Simulation' },
    { key: 'Sector Location', val: a.location },
    { key: 'Event UID', val: a.id },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-modal-title"
      onClick={e => {
        if (e.target === e.currentTarget) closeLightbox();
      }}
      className="fixed inset-0 z-[200] bg-slate-950/55 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <SpatialOverlay className="ui-dialog spatial-glass-overlay max-w-[680px] w-full overflow-hidden text-txt-primary">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-subtle">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
            a.sev === 'high' ? 'bg-status-danger-surface text-status-danger' : 'bg-status-warning-surface text-status-warning'
          }`}>
            {a.type}
          </span>
          <div id="evidence-modal-title" className="text-sm md:text-base font-bold font-display text-txt-primary flex-1 truncate">
            {meta.label} — {a.id}
          </div>
          <button
            onClick={closeLightbox}
            aria-label="Close evidence modal"
            className="w-8 h-8 rounded-[10px] hover:bg-primary-surface/70 flex items-center justify-center text-sm text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {/* Unified 4-metric hairline strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border-subtle border-b border-border-subtle bg-surface/50">
          <div className="px-4 py-2.5 text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Event</span>
            <b className="text-xs font-bold text-status-danger truncate block mt-0.5">{meta.label}</b>
          </div>
          <div className="px-4 py-2.5 text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Priority</span>
            <b className="text-xs font-bold text-status-warning uppercase block mt-0.5">{a.sev}</b>
          </div>
          <div className="px-4 py-2.5 text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Status</span>
            <b className="text-xs font-bold text-info truncate block mt-0.5">{a.reviewed ? 'Reviewed' : 'Action Req'}</b>
          </div>
          <div className="px-4 py-2.5 text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Camera</span>
            <b className="text-xs font-bold text-primary truncate block mt-0.5">{a.camName.split('·')[0].trim()}</b>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Level 5 Operational Evidence Viewport (Strictly opaque dark, unblurred) */}
          <div className="w-full aspect-[16/9] rounded-[10px] overflow-hidden border border-border-default bg-[#050d17] relative shadow-inner">
            {a.snapshot ? (
              <img
                src={a.snapshot}
                alt="Forensic Frame Snapshot"
                className="w-full h-full object-cover block"
              />
            ) : (
              <>
                <div
                  className="absolute inset-0"
                  dangerouslySetInnerHTML={{ __html: getSceneSvg(cam?.scene || 'fence') }}
                />
                <div className="cv-vignette absolute inset-0" />
                <div className="scanlines absolute inset-0" />

                <div
                  className={`dbox ${isThreat ? 'threat' : ''}`}
                  style={{
                    left: `${(cam?.anchor.left || 44) - 6}%`,
                    top: `${(cam?.anchor.top || 46) - 4}%`,
                    width: `${(cam?.anchor.w || 10) + 12}%`,
                    height: `${(cam?.anchor.h || 24) + 8}%`,
                    zIndex: 2
                  }}
                >
                  <div className="dbox-tag">{!isDetector ? '[SIM] ' : ''}{a.type.toUpperCase()} {a.confidence}%</div>
                </div>
              </>
            )}

            <div className="absolute top-2.5 right-2.5 z-[3] flex items-center gap-1.5 bg-black/80 px-2.5 py-1 rounded-lg text-[9.5px] font-bold text-white border border-white/20 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {a.snapshot ? 'LIVE SNAPSHOT' : isDetector ? 'DETECTOR CAPTURE' : 'SIMULATION FRAME'}
            </div>

            <div className="absolute bottom-2.5 left-2.5 z-[3] font-mono text-[9.5px] text-slate-300 bg-black/80 px-2.5 py-1 rounded-lg border border-white/20 truncate">
              {a.camName.split('·')[0]?.trim() || a.camName} · {cam?.geo || 'GPS UNAVAILABLE'}
            </div>
          </div>

          {/* Hairline-divided metadata grid instead of 12 individual mini-cards */}
          <div className="rounded-[10px] border border-border-subtle bg-surface/75 grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border-subtle overflow-hidden">
            {fields.map((f, i) => (
              <div key={i} className="p-2.5 min-w-0">
                <div className="text-[9px] text-txt-muted uppercase tracking-wider font-bold mb-0.5 truncate">{f.key}</div>
                <div className="text-xs text-txt-primary font-mono font-semibold truncate">{f.val}</div>
              </div>
            ))}
          </div>

          {recommendation && (
            <div className="border-t border-border-subtle pt-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-txt-primary flex items-center gap-1.5 text-xs">
                  <i className="ti ti-compass text-status-warning"></i>
                  Sentry Protocol Guidance
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-status-success-surface text-status-success">
                  {recommendation.status}
                </span>
              </div>
              <p className="text-txt-secondary text-xs leading-relaxed m-0">
                {recommendation.actionSummary}
              </p>
              <div className="space-y-1 pt-1">
                {recommendation.tacticalActions.slice(0, 2).map((act: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs text-txt-primary">
                    <span className="text-primary font-bold">›</span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-border-subtle">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-border-default bg-surface/75 text-txt-primary hover:bg-surface text-xs font-bold transition-all"
            >
              <i className="ti ti-download" aria-hidden="true" />
              <span>Download evidence</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {!a.reviewed && (
              <div className="flex items-center gap-2">
                <select
                  id="disposition-reason-select"
                  defaultValue="verified_threat"
                  className="bg-surface/85 border border-border-default text-txt-primary text-xs px-2.5 py-1.5 rounded-[10px] focus:border-primary focus:outline-none"
                >
                  <option value="verified_threat">Verified Threat / Actioned</option>
                  <option value="authorized_patrol">Authorized Friendly Patrol</option>
                  <option value="false_alarm_animal">False Alarm — Wildlife</option>
                  <option value="false_alarm_weather">False Alarm — Glare / Weather</option>
                </select>
                <button
                  onClick={() => {
                    const sel = document.getElementById('disposition-reason-select') as HTMLSelectElement;
                    markReviewed(a.id, sel?.value || 'verified_threat');
                  }}
                  className="px-3.5 py-1.5 rounded-[10px] text-white font-bold text-xs brand-button transition-all cursor-pointer"
                >
                  <i className="ti ti-check" aria-hidden="true" /> Mark reviewed
                </button>
              </div>
            )}
            <button
              onClick={closeLightbox}
              className="px-3.5 py-1.5 rounded-[10px] border border-border-default bg-surface/70 text-txt-secondary hover:text-txt-primary text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </SpatialOverlay>
    </div>
  );
};
