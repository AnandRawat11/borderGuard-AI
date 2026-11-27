import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { investigateAlert, InvestigationResult } from '../../services/agent37';

const THREAT_META: Record<string, { color: string; bg: string; icon: string }> = {
  LOW:      { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: 'ti-shield-check' },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'ti-alert-triangle' },
  HIGH:     { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: 'ti-shield-exclamation' },
  CRITICAL: { color: '#dc2626', bg: 'rgba(220,38,38,0.18)',   icon: 'ti-skull' },
  UNKNOWN:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: 'ti-question-mark' },
};

export const AIInvestigation: React.FC = () => {
  const { alerts, currentUser } = useApp();
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [customAlertId, setCustomAlertId] = useState('');

  // Pre-select first alert if available
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
    <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
      {/* Header */}
      <div className="border-b border-border-default px-6 py-4 shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <i className="ti ti-brain text-violet-400 text-lg" />
          </span>
          <div>
            <h1 className="text-[15px] font-bold text-txt-primary tracking-tight">AI Incident Investigation</h1>
            <p className="text-[11px] text-txt-muted">Powered by Agent37 · Select an alert to generate an AI investigation report</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-violet-400 bg-violet-400/10 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            AGENT37
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Control Panel */}
        <div className="bg-surface border border-border-default rounded-2xl p-5 space-y-4">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-txt-muted">
            Select Incident
          </div>

          {/* Alert Dropdown */}
          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-txt-secondary block">
              From active alert log
            </label>
            <select
              value={selectedAlertId}
              onChange={e => { setSelectedAlertId(e.target.value); setCustomAlertId(''); }}
              className="w-full bg-canvas border border-border-default rounded-xl px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
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

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border-default/60" />
            <span className="text-[10px] text-txt-muted font-bold uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-border-default/60" />
          </div>

          {/* Manual ID */}
          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-txt-secondary block">
              Enter alert ID manually
            </label>
            <input
              type="text"
              value={customAlertId}
              onChange={e => { setCustomAlertId(e.target.value); setSelectedAlertId(''); }}
              placeholder="e.g. alert-abc123"
              className="w-full bg-canvas border border-border-default rounded-xl px-3 py-2.5 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
              id="investigation-alert-id-input"
            />
          </div>

          <button
            id="investigation-run-btn"
            onClick={runInvestigation}
            disabled={loading || !activeId.trim()}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-bold text-[13px] transition-all ${
              loading || !activeId.trim()
                ? 'bg-violet-500/20 text-violet-300/50 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5'
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
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3.5 text-[12px] text-red-400">
              <i className="ti ti-alert-circle mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Results */}
        {result && inv && meta && (
          <div className="space-y-4 animate-[fadeIn_0.4s_ease]">
            {/* Threat header */}
            <div
              className="rounded-2xl p-5 border flex items-center gap-4"
              style={{ background: meta.bg, borderColor: `${meta.color}30` }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: `${meta.color}20`, color: meta.color }}
              >
                <i className={`ti ${meta.icon}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: meta.color, color: '#fff' }}
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
                <div className="text-[22px] font-extrabold" style={{ color: meta.color }}>{inv.confidence}%</div>
                <div className="text-[10px] text-txt-muted">Confidence</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Timeline */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-timeline text-violet-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Incident Timeline</span>
                </div>
                {inv.timeline.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No timeline data available.</p>
                ) : (
                  <div className="space-y-3">
                    {inv.timeline.map((t, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-violet-500 mt-0.5 shrink-0" />
                          {i < inv.timeline.length - 1 && <div className="w-px flex-1 bg-border-default/50 mt-1" />}
                        </div>
                        <div className="pb-3 min-w-0">
                          <div className="text-[10px] text-txt-muted font-mono">{t.time}</div>
                          <div className="text-[12px] text-txt-primary">{t.event}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Key Findings */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-search text-amber-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Key Findings</span>
                </div>
                {inv.key_findings.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No findings reported.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {inv.key_findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <i className="ti ti-point-filled text-amber-400 mt-0.5 shrink-0 text-[8px]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recommended Actions */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-clipboard-list text-emerald-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Recommended Actions</span>
                </div>
                {inv.recommended_actions.length === 0 ? (
                  <p className="text-[12px] text-txt-muted italic">No actions recommended.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {inv.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-txt-primary">
                        <span className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {a}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Notes */}
              <div className="bg-surface border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-notes text-sky-400" />
                  <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">Analyst Notes</span>
                </div>
                <p className="text-[12px] text-txt-secondary leading-relaxed">{inv.notes || 'No additional notes.'}</p>
                <div className="mt-4 pt-4 border-t border-border-default/50 flex items-center gap-2 text-[11px] text-txt-muted">
                  <i className="ti ti-robot" />
                  <span>Report generated by Agent37 AI · Supervisor review required before operational use</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <i className="ti ti-brain text-violet-400 text-3xl" />
            </div>
            <div className="text-[14px] font-bold text-txt-primary mb-1">No Investigation Active</div>
            <div className="text-[12px] text-txt-muted max-w-xs">
              Select an alert from the log above and click <strong>Run AI Investigation</strong> to generate an Agent37 intelligence report.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
