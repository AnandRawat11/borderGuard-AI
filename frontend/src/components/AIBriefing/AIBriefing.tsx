import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getSurveillanceBriefing, BriefingResult } from '../../services/agent37';

const THREAT_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  QUIET:    { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   label: 'All Quiet',     icon: 'ti-shield-check' },
  ELEVATED: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Elevated',       icon: 'ti-alert-triangle' },
  HIGH:     { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'High Threat',   icon: 'ti-shield-exclamation' },
  CRITICAL: { color: '#dc2626', bg: 'rgba(220,38,38,0.16)',  label: 'Critical',      icon: 'ti-skull' },
  UNKNOWN:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'Unknown',       icon: 'ti-question-mark' },
};

const TYPE_COLORS: Record<string, string> = {
  intrusion: '#ef4444',
  watchlist: '#8b5cf6',
  anpr:      '#3b82f6',
  loiter:    '#f59e0b',
  night:     '#06b6d4',
  weapon:    '#dc2626',
};

const WINDOW_OPTIONS = [
  { label: 'Last 1h',  hours: 1 },
  { label: 'Last 4h',  hours: 4 },
  { label: 'Last 12h', hours: 12 },
  { label: 'Last 24h', hours: 24 },
  { label: 'Last 48h', hours: 48 },
  { label: 'Last 7d',  hours: 168 },
];

export const AIBriefing: React.FC = () => {
  const { currentUser } = useApp();
  const [hoursBack, setHoursBack] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BriefingResult | null>(null);

  async function fetchBriefing() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getSurveillanceBriefing(hoursBack, currentUser?.accessToken);
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Briefing generation failed.');
    } finally {
      setLoading(false);
    }
  }

  const b = result?.briefing;
  const meta = b ? (THREAT_META[b.threat_overview] || THREAT_META.UNKNOWN) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
      {/* Header */}
      <div className="border-b border-border-default px-6 py-4 shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center">
            <i className="ti ti-file-report text-sky-400 text-lg" />
          </span>
          <div>
            <h1 className="text-[15px] font-bold text-txt-primary tracking-tight">AI Surveillance Briefing</h1>
            <p className="text-[11px] text-txt-muted">Powered by Agent37 · Aggregated intelligence summary for a selected time window</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-sky-400 bg-sky-400/10 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            AGENT37
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Control Panel */}
        <div className="bg-surface border border-border-default rounded-2xl p-5 space-y-4">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-txt-muted">
            Time Window
          </div>
          <div className="flex flex-wrap gap-2">
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                onClick={() => setHoursBack(opt.hours)}
                className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold transition-all ${
                  hoursBack === opt.hours
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                    : 'bg-canvas border border-border-default text-txt-secondary hover:border-sky-400/50 hover:text-sky-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            id="briefing-generate-btn"
            onClick={fetchBriefing}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-bold text-[13px] transition-all ${
              loading
                ? 'bg-sky-500/20 text-sky-300/50 cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 hover:-translate-y-0.5'
            }`}
          >
            {loading ? (
              <>
                <i className="ti ti-loader-2 animate-spin" />
                Agent37 is generating briefing…
              </>
            ) : (
              <>
                <i className="ti ti-file-report" />
                Generate Briefing
              </>
            )}
          </button>
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3.5 text-[12px] text-red-400">
              <i className="ti ti-alert-circle mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Results */}
        {result && b && meta && (
          <div className="space-y-4 animate-[fadeIn_0.4s_ease]">
            {/* Threat Banner */}
            <div
              className="rounded-2xl p-5 border"
              style={{ background: meta.bg, borderColor: `${meta.color}30` }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: `${meta.color}20`, color: meta.color }}
                >
                  <i className={`ti ${meta.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full text-white"
                      style={{ background: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-txt-muted">
                      {b.period} · {result.alert_count} alerts analysed
                    </span>
                    <span className="ml-auto text-[11px] text-txt-muted">
                      Confidence: <strong className="text-txt-primary">{b.confidence}%</strong>
                    </span>
                  </div>
                  <p className="text-[13px] text-txt-primary leading-snug">{b.executive_summary}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Alert Breakdown */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-chart-bar text-sky-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Alert Breakdown</span>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(b.alert_breakdown).map(([type, count]) => {
                    const color = TYPE_COLORS[type] || '#94a3b8';
                    const total = Object.values(b.alert_breakdown).reduce((a, b) => a + b, 0) || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="font-semibold text-txt-primary capitalize">{type}</span>
                          <span className="text-txt-muted">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-canvas rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hotspot Cameras */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-camera text-orange-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Hotspot Cameras</span>
                </div>
                {b.hotspot_cameras.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No hotspots identified.</p>
                ) : (
                  <ul className="space-y-2">
                    {b.hotspot_cameras.map((cam, i) => (
                      <li key={i} className="flex items-center gap-2.5 text-[12px] text-txt-primary">
                        <span className="w-5 h-5 rounded-md bg-orange-500/15 text-orange-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        {cam}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Patterns Observed */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-network text-purple-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Patterns Observed</span>
                </div>
                {b.patterns_observed.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No significant patterns detected.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {b.patterns_observed.map((p, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <i className="ti ti-point-filled text-purple-400 mt-0.5 shrink-0 text-[8px]" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recommended Priorities */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-list-check text-emerald-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Recommended Priorities</span>
                </div>
                {b.recommended_priorities.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No priorities to report.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {b.recommended_priorities.map((p, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <span className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {p}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* Key Incidents */}
            {b.key_incidents.length > 0 && (
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-flag text-red-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Key Incidents</span>
                </div>
                <div className="space-y-3">
                  {b.key_incidents.map((inc, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-canvas rounded-xl border border-border-default/60">
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-extrabold shrink-0 mt-0.5"
                        style={{
                          background: `${TYPE_COLORS[inc.type] || '#94a3b8'}20`,
                          color: TYPE_COLORS[inc.type] || '#94a3b8',
                        }}
                      >
                        <i className="ti ti-bell" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] font-bold text-txt-primary capitalize">{inc.type}</span>
                          <span className="text-[10px] text-txt-muted">· {inc.camera} · {inc.id?.slice(0, 10)}…</span>
                        </div>
                        <p className="text-[12px] text-txt-secondary">{inc.significance}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-txt-muted justify-center pt-1">
              <i className="ti ti-robot" />
              Briefing generated by Agent37 AI · Supervisor review required before operational use
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-4">
              <i className="ti ti-file-report text-sky-400 text-3xl" />
            </div>
            <div className="text-[14px] font-bold text-txt-primary mb-1">No Briefing Generated</div>
            <div className="text-[12px] text-txt-muted max-w-xs">
              Select a time window and click <strong>Generate Briefing</strong> to get an Agent37 AI-powered surveillance intelligence report.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
