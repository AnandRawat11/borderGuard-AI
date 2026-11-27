import React, { useEffect, useState } from 'react';
import { useApp, TYPE_META } from '../../context/AppContext';
import { getSceneSvg } from '../../services/mockScenes';
import { api } from '../../services/api';

export const EvidenceModal: React.FC = () => {
  const { activeLightboxAlert, closeLightbox, markReviewed, cams, currentUser, showNotice } = useApp();
  const [terrain, setTerrain] = useState<any>(null);
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
    api.getAlertTerrain(activeLightboxAlert.id, currentUser?.accessToken)
      .then(setTerrain)
      .catch(() => null);
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
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
    >
      <div className="bg-surface border border-border-default rounded-[20px] max-w-[680px] w-full overflow-hidden shadow-2xl space-y-0 text-txt-primary">
        
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-default bg-surface-subtle">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
            a.sev === 'high' ? 'bg-[#fff0f1] text-[#c84f58]' : 'bg-[#fff4e4] text-[#c77a21]'
          }`}>
            {a.type}
          </span>
          <div id="evidence-modal-title" className="text-sm md:text-base font-bold font-display text-txt-primary flex-1 truncate">
            {meta.label} — {a.id}
          </div>
          <button
            onClick={closeLightbox}
            aria-label="Close evidence modal"
            className="w-8 h-8 rounded-xl border border-border-default hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-sm text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 4 Colored KPI Badges at the top of the modal */}
        <div className="grid grid-cols-4 gap-2 p-4 pb-0 bg-surface">
          <div className="p-2.5 rounded-xl border border-t-2 border-border-default border-t-[#c84f58] bg-surface-subtle text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Event</span>
            <b className="text-xs font-bold text-[#c84f58] truncate block mt-0.5">{meta.label}</b>
          </div>
          <div className="p-2.5 rounded-xl border border-t-2 border-border-default border-t-[#c77a21] bg-surface-subtle text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Priority</span>
            <b className="text-xs font-bold text-[#c77a21] uppercase block mt-0.5">{a.sev}</b>
          </div>
          <div className="p-2.5 rounded-xl border border-t-2 border-border-default border-t-[#5277d7] bg-surface-subtle text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Status</span>
            <b className="text-xs font-bold text-[#5277d7] truncate block mt-0.5">{a.reviewed ? 'Reviewed' : 'Action Req'}</b>
          </div>
          <div className="p-2.5 rounded-xl border border-t-2 border-border-default border-t-[#0b8d8b] bg-surface-subtle text-center">
            <span className="text-[9px] font-bold text-txt-muted uppercase block">Camera</span>
            <b className="text-xs font-bold text-[#0b8d8b] truncate block mt-0.5">{a.camName.split('·')[0].trim()}</b>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Associated Evidence Preview Area */}
          <div className="w-full aspect-[16/9] rounded-xl overflow-hidden border border-border-default bg-[#050d17] relative shadow-inner">
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

                {/* Simulated Bounding Box */}
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

            {/* Evidence Badges */}
            <div className="absolute top-2.5 right-2.5 z-[3] flex items-center gap-1.5 bg-black/80 px-2.5 py-1 rounded-lg text-[9.5px] font-bold text-white border border-white/20 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {a.snapshot ? 'LIVE SNAPSHOT' : isDetector ? 'DETECTOR CAPTURE' : 'SIMULATION FRAME'}
            </div>

            <div className="absolute bottom-2.5 left-2.5 z-[3] font-mono text-[9.5px] text-slate-300 bg-black/80 px-2.5 py-1 rounded-lg border border-white/20 truncate">
              {a.camName.split('·')[0]?.trim() || a.camName} · {cam?.geo || 'GPS UNAVAILABLE'}
            </div>
          </div>

          {/* Key-Value Fields Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {fields.map((f, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-surface-subtle border border-border-default">
                <div className="text-[9px] text-txt-muted uppercase tracking-wider font-bold mb-0.5">{f.key}</div>
                <div className="text-xs text-txt-primary font-mono font-bold truncate">{f.val}</div>
              </div>
            ))}
          </div>

          {/* Topographic Profile */}
          {terrain && (
            <div className="border border-border-default rounded-xl p-3.5 bg-surface-subtle text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-border-default pb-1.5">
                <span className="font-bold text-txt-primary flex items-center gap-1.5 text-xs">
                  <i className="ti ti-mountain text-[#0b8d8b]"></i>
                  GIS Topographic Profile
                </span>
                <span className="text-[10px] font-mono text-txt-muted">{terrain.datasetSource}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-surface p-2 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[9px] uppercase font-bold">Elevation</div>
                  <div className="font-mono font-bold text-txt-primary">{terrain.elevationM}m</div>
                </div>
                <div className="bg-surface p-2 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[9px] uppercase font-bold">Slope</div>
                  <div className="font-mono font-bold text-txt-primary">{terrain.slopeDeg}°</div>
                </div>
                <div className="bg-surface p-2 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[9px] uppercase font-bold">Cover</div>
                  <div className="font-bold text-[#25855c] capitalize truncate">{terrain.landCover.replace('_', ' ')}</div>
                </div>
                <div className="bg-surface p-2 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[9px] uppercase font-bold">Nearest Road</div>
                  <div className="font-mono font-bold text-[#0b8d8b]">{terrain.nearestRoadDistanceM}m</div>
                </div>
              </div>
            </div>
          )}

          {/* Tactical Recommendation */}
          {recommendation && (
            <div className="border border-border-default rounded-xl p-3.5 bg-surface-subtle text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-border-default pb-1.5">
                <span className="font-bold text-txt-primary flex items-center gap-1.5 text-xs">
                  <i className="ti ti-compass text-[#c77a21]"></i>
                  Sentry Protocol Guidance
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#eaf7ef] text-[#25855c]">
                  {recommendation.status}
                </span>
              </div>
              <p className="text-txt-muted text-xs leading-relaxed m-0">
                {recommendation.actionSummary}
              </p>
              <div className="space-y-1 pt-1">
                {recommendation.tacticalActions.slice(0, 2).map((act: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs text-txt-primary">
                    <span className="text-[#0b8d8b] font-bold">›</span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-border-default bg-surface-subtle">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-default bg-surface text-txt-primary hover:shadow-xs text-xs font-bold transition-all"
            >
              <span>⇩</span>
              <span>Download evidence</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {!a.reviewed && (
              <div className="flex items-center gap-2">
                <select
                  id="disposition-reason-select"
                  defaultValue="verified_threat"
                  className="bg-surface border border-border-default text-txt-primary text-xs px-2.5 py-1.5 rounded-xl focus:border-[#0b8d8b] focus:outline-none"
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
                  className="px-3.5 py-1.5 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] shadow-xs transition-all cursor-pointer"
                >
                  ✓ Mark reviewed
                </button>
              </div>
            )}
            <button
              onClick={closeLightbox}
              className="px-3.5 py-1.5 rounded-xl border border-border-default text-txt-muted hover:text-txt-primary text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
