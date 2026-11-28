import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const EmergencyAlertBanner: React.FC = () => {
  const {
    activeCriticalAlert,
    dismissCriticalBanner,
    updateAlertState,
    openLightbox,
    openPatrolModal,
    escalateAlert
  } = useApp();

  const [slaSecondsRemaining, setSlaSecondsRemaining] = useState<number>(300); // 5 minute default response SLA

  useEffect(() => {
    if (!activeCriticalAlert) {
      setSlaSecondsRemaining(300);
      return;
    }

    // Calculate SLA remaining based on alert timestamp + 5 minutes
    const alertTime = new Date(activeCriticalAlert.ts).getTime();
    const deadlineTime = alertTime + 5 * 60 * 1000;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((deadlineTime - Date.now()) / 1000));
      setSlaSecondsRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeCriticalAlert]);

  if (!activeCriticalAlert) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isSlaBreached = slaSecondsRemaining <= 0;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="shrink-0 bg-status-danger-surface/95 border-b border-status-danger-border text-txt-primary shadow-sm relative z-40 backdrop-blur-md"
    >
      {/* Top pulsing beacon beam */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-status-danger-border" />

      <div className="max-w-[1920px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Alert Headline */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0 flex items-center justify-center">
            <span className="absolute -inset-1 rounded-full bg-status-danger/10" />
            <div className="relative w-8 h-8 rounded-lg bg-rose-600 border border-rose-300 flex items-center justify-center text-white shadow-card">
              <i className="ti ti-shield-exclamation text-lg" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest bg-red-700 text-white px-2 py-0.5 rounded shadow-xs">
                CRITICAL THREAT
              </span>
              <span className="font-mono text-xs font-bold text-status-danger">
                {activeCriticalAlert.id}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-surface border border-status-danger-border text-status-danger">
                {activeCriticalAlert.camName}
              </span>
              <span className="text-[10px] text-txt-secondary hidden md:inline">
                • {activeCriticalAlert.location}
              </span>
            </div>

            <div className="text-xs md:text-sm font-extrabold text-txt-primary truncate mt-0.5">
              {activeCriticalAlert.detail}
            </div>
          </div>
        </div>

        {/* Center: Live Response SLA Countdown */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-status-danger-border">
            <i className={`ti ti-clock-hour-4 text-xs ${isSlaBreached ? 'text-status-danger animate-pulse' : 'text-status-warning'}`} />
            <div className="text-left">
              <div className="text-[8px] font-bold uppercase text-txt-muted tracking-wider">
                {isSlaBreached ? 'SLA BREACHED' : 'RESPONSE SLA'}
              </div>
              <div className={`font-mono text-xs font-black tabular-nums ${isSlaBreached ? 'text-status-danger' : 'text-status-warning'}`}>
                {isSlaBreached ? '00:00 EXCEEDED' : `${formatTimer(slaSecondsRemaining)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Tactical Action Command Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Acknowledge Button */}
          <button
            onClick={() => updateAlertState(activeCriticalAlert.id, 'acknowledged')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md hover:shadow-emerald-500/30 transition-all cursor-pointer border border-emerald-400/40"
          >
            <i className="ti ti-check text-sm" />
            <span>Acknowledge</span>
          </button>

          {/* Dispatch Quick Reaction Team */}
          <button
            onClick={() => openPatrolModal(activeCriticalAlert)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-subtle text-txt-primary text-xs font-black shadow-card transition-all cursor-pointer border border-border-default"
          >
            <i className="ti ti-send text-sm" />
            <span>Dispatch QRT</span>
          </button>

          {/* Forensic Evidence Lightbox */}
          <button
            onClick={() => openLightbox(activeCriticalAlert.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-subtle text-txt-primary text-xs font-bold border border-border-default transition-all"
            title="Inspect evidentiary snapshot"
          >
            <i className="ti ti-photo-scan text-sm" />
            <span className="hidden sm:inline">Evidence</span>
          </button>

          {/* Escalate Button */}
          <button
            onClick={() => escalateAlert(activeCriticalAlert.id, 'tactical_team', 'Urgent critical breach escalation via Emergency HUD')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-800/80 hover:bg-rose-700 text-rose-100 text-xs font-bold border border-rose-500/40 transition-all"
            title="Escalate to Sector Commander / Quick Reaction Force"
          >
            <i className="ti ti-arrow-badge-up text-sm" />
            <span className="hidden sm:inline">Escalate</span>
          </button>

          {/* Dismiss Banner Button */}
          <button
            onClick={dismissCriticalBanner}
            className="p-1 rounded-lg text-status-danger hover:text-txt-primary hover:bg-surface transition-colors ml-1"
            aria-label="Dismiss banner"
          >
            <i className="ti ti-x text-base" />
          </button>
        </div>
      </div>
    </div>
  );
};
