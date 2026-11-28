import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getSurveillanceBriefing, BriefingResult } from '../../services/agent37';

const THREAT_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  QUIET:    { color: 'var(--green)', bg: 'var(--green-soft)',   label: 'All Quiet',     icon: 'ti-shield-check' },
  ELEVATED: { color: 'var(--warning-ink)', bg: 'var(--orange-soft)', label: 'Elevated',       icon: 'ti-alert-triangle' },
  HIGH:     { color: 'var(--red)', bg: 'var(--red-soft)',   label: 'High Threat',   icon: 'ti-shield-exclamation' },
  CRITICAL: { color: 'var(--red)', bg: 'var(--red-soft)',  label: 'Critical',      icon: 'ti-skull' },
  UNKNOWN:  { color: 'var(--muted)', bg: 'var(--bg-muted)', label: 'Unknown',       icon: 'ti-question-mark' },
};

const TYPE_COLORS: Record<string, string> = {
  intrusion: 'var(--warning-ink)',
  watchlist: 'var(--primary)',
  anpr: 'var(--purple)',
  loiter: 'var(--green)',
  night: 'var(--blue)',
  weapon: 'var(--red)',
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
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      {/* Frosted Header */}
      <div className="spatial-glass-nav border-b border-border-default px-6 py-4 shrink-0">
        <div className="flex items-center gap-2.5 max-w-[1200px] mx-auto">
          <i className="ti ti-file-report text-primary text-lg" aria-hidden="true" />
          <h1 className="text-[15px] font-bold font-display text-txt-primary tracking-tight">AI Surveillance Briefing</h1>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-primary bg-primary-surface/85 border border-primary-border/70 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            AGENT37
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-[1200px] w-full mx-auto">
        <div className="spatial-glass p-5 space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">
            Time Window
          </div>
          <div className="flex flex-wrap gap-2">
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                onClick={() => setHoursBack(opt.hours)}
                className={`px-3.5 py-1.5 rounded-[10px] text-[12px] font-bold transition-all ${
                  hoursBack === opt.hours
                    ? 'brand-button'
                    : 'bg-surface/75 border border-border-default text-txt-secondary hover:border-primary-border hover:text-primary'
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
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] font-bold text-[13px] transition-all ${
              loading
                ? 'ui-disabled'
                : 'brand-button hover:-translate-y-0.5'
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
            <div className="flex items-start gap-2.5 bg-status-danger-surface border border-status-danger-border rounded-[10px] p-3.5 text-[12px] text-status-danger">
              <i className="ti ti-alert-circle mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {result && b && meta && (
          <div className="space-y-4">
            <div
              className="spatial-glass p-5"
              style={{ borderColor: `color-mix(in srgb, ${meta.color} 32%, transparent)` }}
            >
              <div className="flex items-center gap-4">
                <i className={`ti ${meta.icon} text-2xl shrink-0`} style={{ color: meta.color }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-txt-muted">
                      {b.period} · {result.alert_count} alerts analysed
                    </span>
                    <span className="ml-auto text-[11px] text-txt-muted">
                      Confidence: <strong className="text-txt-primary font-mono">{b.confidence}%</strong>
                    </span>
                  </div>
                  <p className="text-[13px] text-txt-primary leading-snug">{b.executive_summary}</p>
                </div>
              </div>
            </div>

            <div className="spatial-glass grid grid-cols-1 md:grid-cols-2 divide-y md:divide-x divide-border-subtle overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-chart-bar text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Alert Breakdown</span>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(b.alert_breakdown).map(([type, count]) => {
                    const color = TYPE_COLORS[type] || 'var(--muted)';
                    const total = Object.values(b.alert_breakdown).reduce((a, b) => a + b, 0) || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="font-semibold text-txt-primary capitalize">{type}</span>
                          <span className="text-txt-muted font-mono tabular-nums">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-surface/80 rounded-full overflow-hidden">
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

              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-camera text-status-warning" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Hotspot Cameras</span>
                </div>
                {b.hotspot_cameras.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No hotspots identified.</p>
                ) : (
                  <ul className="space-y-2">
                    {b.hotspot_cameras.map((cam, i) => (
                      <li key={i} className="flex items-center gap-2.5 text-[12px] text-txt-primary">
                        <span className="font-mono text-status-warning font-bold text-[11px] shrink-0">
                          #{i + 1}
                        </span>
                        {cam}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-network text-accent" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Patterns Observed</span>
                </div>
                {b.patterns_observed.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No significant patterns detected.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {b.patterns_observed.map((p, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <i className="ti ti-point-filled text-accent mt-0.5 shrink-0 text-[8px]" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-list-check text-status-success" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Recommended Priorities</span>
                </div>
                {b.recommended_priorities.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No priorities to report.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {b.recommended_priorities.map((p, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <span className="font-mono text-status-success font-bold text-[11px] shrink-0">
                          {String(i + 1).padStart(2, '0')}.
                        </span>
                        {p}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {b.key_incidents.length > 0 && (
              <div className="spatial-glass overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border-subtle">
                  <i className="ti ti-flag text-status-danger" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Key Incidents</span>
                </div>
                <div className="divide-y divide-border-subtle bg-surface/45">
                  {b.key_incidents.map((inc, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                      <i
                        className="ti ti-bell text-sm shrink-0 mt-0.5"
                        style={{ color: TYPE_COLORS[inc.type] || 'var(--muted)' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] font-bold text-txt-primary capitalize">{inc.type}</span>
                          <span className="text-[10px] text-txt-muted font-mono">· {inc.camera} · {inc.id?.slice(0, 10)}…</span>
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

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <i className="ti ti-file-report text-primary text-2xl mb-2 opacity-80" aria-hidden="true" />
            <div className="text-[14px] font-bold text-txt-primary">No Briefing Generated</div>
          </div>
        )}
      </div>
    </div>
  );
};
