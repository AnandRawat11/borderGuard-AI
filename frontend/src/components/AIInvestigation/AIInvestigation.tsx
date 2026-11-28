import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { investigateAlert, InvestigationResult } from '../../services/agent37';

const THREAT_META: Record<string, { color: string; bg: string; icon: string }> = {
  LOW:      { color: 'var(--green)', bg: 'var(--green-soft)',   icon: 'ti-shield-check' },
  MEDIUM:   { color: 'var(--warning-ink)', bg: 'var(--orange-soft)', icon: 'ti-alert-triangle' },
  HIGH:     { color: 'var(--red)', bg: 'var(--red-soft)',   icon: 'ti-shield-exclamation' },
  CRITICAL: { color: 'var(--red)', bg: 'var(--red-soft)',   icon: 'ti-skull' },
  UNKNOWN:  { color: 'var(--muted)', bg: 'var(--bg-muted)', icon: 'ti-question-mark' },
};

export const AIInvestigation: React.FC = () => {
  const { alerts, currentUser } = useApp();
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [customAlertId, setCustomAlertId] = useState('');

  useEffect(() => {
    if (alerts.length > 0 && !selectedAlertId) {
      setSelectedAlertId(alerts[0].id);
    }
  }, [alerts]);

  const activeId = selectedAlertId || customAlertId;

  async function runInvestigation() {
    if (!activeId.trim()) {
      setError('Please select or enter an alert ID.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await investigateAlert(activeId.trim(), currentUser?.accessToken);
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Investigation failed.');
    } finally {
      setLoading(false);
    }
  }

  const inv = result?.investigation;
  const meta = inv ? (THREAT_META[inv.threat_level] || THREAT_META.UNKNOWN) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      {/* Frosted Header */}
      <div className="spatial-glass-nav border-b border-border-default px-6 py-4 shrink-0">
        <div className="flex items-center gap-2.5 max-w-[1200px] mx-auto">
          <i className="ti ti-brain text-primary text-lg" aria-hidden="true" />
          <h1 className="text-[15px] font-bold font-display text-txt-primary tracking-tight">AI Incident Investigation</h1>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-primary bg-primary-surface/85 border border-primary-border/70 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            AGENT37
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-[1200px] w-full mx-auto">
        {/* Control Panel */}
        <div className="spatial-glass p-5 space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">
            Select Incident
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-txt-secondary block">
                From active alert log
              </label>
              <select
                value={selectedAlertId}
                onChange={e => { setSelectedAlertId(e.target.value); setCustomAlertId(''); }}
                className="w-full bg-surface/85 border border-border-default rounded-[10px] px-3 py-2 text-[13px] text-txt-primary focus:outline-none focus:ring-2 focus:ring-primary-border transition"
                id="investigation-alert-select"
              >
                <option value="">-- Choose an alert --</option>
                {alerts.map(a => (
                  <option key={a.id} value={a.id}>
                    [{a.sev.toUpperCase()}] {a.type} · {a.camName} · {a.id.slice(0, 12)}…
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center py-2 text-[10px] text-txt-muted font-bold uppercase tracking-widest">
              or
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-txt-secondary block">
                Enter alert ID manually
              </label>
              <input
                type="text"
                value={customAlertId}
                onChange={e => { setCustomAlertId(e.target.value); setSelectedAlertId(''); }}
                placeholder="e.g. alert-abc123"
                className="w-full bg-surface/85 border border-border-default rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-primary-border transition"
                id="investigation-alert-id-input"
              />
            </div>
          </div>

          <button
            id="investigation-run-btn"
            onClick={runInvestigation}
            disabled={loading || !activeId.trim()}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] font-bold text-[13px] transition-all ${
              loading || !activeId.trim()
                ? 'ui-disabled'
                : 'brand-button hover:-translate-y-0.5'
            }`}
          >
            {loading ? (
              <>
                <i className="ti ti-loader-2 animate-spin" />
                Agent37 is investigating…
              </>
            ) : (
              <>
                <i className="ti ti-brain" />
                Run AI Investigation
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

        {/* Results */}
        {result && inv && meta && (
          <div className="space-y-4">
            <div
              className="spatial-glass p-5 flex items-center gap-4"
              style={{ borderColor: `color-mix(in srgb, ${meta.color} 32%, transparent)` }}
            >
              <i className={`ti ${meta.icon} text-2xl shrink-0`} style={{ color: meta.color }} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {inv.threat_level}
                  </span>
                  <span className="text-[11px] text-txt-muted">
                    Alert: <code className="text-txt-primary">{result.alert_id.slice(0, 16)}…</code>
                    &nbsp;·&nbsp;{result.correlated_count} correlated alerts
                  </span>
                </div>
                <p className="text-[13px] text-txt-primary leading-snug">{inv.summary}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[22px] font-extrabold font-mono tabular-nums" style={{ color: meta.color }}>{inv.confidence}%</div>
                <div className="text-[10px] text-txt-muted">Confidence</div>
              </div>
            </div>

            <div className="spatial-glass grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-subtle overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-timeline text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Incident Timeline</span>
                </div>
                {inv.timeline.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No timeline data available.</p>
                ) : (
                  <div className="space-y-3">
                    {inv.timeline.map((t, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0" />
                          {i < inv.timeline.length - 1 && <div className="w-px flex-1 bg-border-subtle mt-1" />}
                        </div>
                        <div className="pb-2.5 min-w-0">
                          <div className="text-[10px] text-txt-muted font-mono">{t.time}</div>
                          <div className="text-[12px] text-txt-primary">{t.event}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-search text-status-warning" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Key Findings</span>
                </div>
                {inv.key_findings.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No findings reported.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {inv.key_findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <i className="ti ti-point-filled text-status-warning mt-0.5 shrink-0 text-[8px]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="spatial-glass grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-subtle overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-clipboard-list text-status-success" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Recommended Actions</span>
                </div>
                {inv.recommended_actions.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No actions recommended.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {inv.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <span className="font-mono text-primary font-bold text-[11px] shrink-0">
                          {String(i + 1).padStart(2, '0')}.
                        </span>
                        {a}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-border-subtle">
                  <i className="ti ti-notes text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Analyst Notes</span>
                </div>
                <p className="text-[12px] text-txt-secondary leading-relaxed">{inv.notes || 'No additional notes.'}</p>
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center gap-2 text-[11px] text-txt-muted">
                  <i className="ti ti-robot" />
                  <span>Report generated by Agent37 AI · Supervisor review required before operational use</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <i className="ti ti-brain text-primary text-2xl mb-2 opacity-80" aria-hidden="true" />
            <div className="text-[14px] font-bold text-txt-primary">No Investigation Active</div>
          </div>
        )}
      </div>
    </div>
  );
};
