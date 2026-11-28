import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { FeatureFlag } from '../../types';

const DEFAULT_SITE_ID = 'site-alpha';

export const FeatureControlsPage: React.FC = () => {
  const { currentUser, showNotice } = useApp();
  const siteId = currentUser?.siteIds?.find(id => id !== '*') || DEFAULT_SITE_ID;
  const canManage = currentUser?.role === 'admin';

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = useMemo(() => flags.filter(flag => flag.enabled).length, [flags]);

  const loadFlags = async () => {
    setLoading(true);
    setError(null);
    try {
      setFlags(await api.getFeatureFlags(siteId, currentUser?.accessToken));
    } catch (err: any) {
      setError(err?.message || 'Feature controls could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.accessToken && !currentUser?.role) {
      setLoading(false);
      return;
    }
    void loadFlags();
  }, [siteId, currentUser?.accessToken]);

  const toggleFlag = async (flag: FeatureFlag) => {
    if (!canManage) {
      showNotice('error', 'Administrator permission is required to change feature controls.');
      return;
    }
    setPendingKey(flag.key);
    setError(null);
    try {
      const updated = await api.updateFeatureFlag(
        flag.key,
        !flag.enabled,
        siteId,
        currentUser?.accessToken,
      );
      setFlags(previous => previous.map(item => item.key === updated.key ? updated : item));
      showNotice('success', `${updated.label} ${updated.enabled ? 'enabled' : 'disabled'} for ${siteId}.`);
    } catch (err: any) {
      setError(err?.message || 'Feature control could not be changed.');
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-[1300px] w-full mx-auto space-y-5 bg-transparent">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-txt-muted">System / Operational controls</div>
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display mt-0.5 leading-tight">
            Feature controls
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning-border bg-status-warning-surface/85 px-3 py-1 text-xs font-bold text-status-warning shrink-0">
          <i className="ti ti-shield-lock text-sm" aria-hidden="true" />
          <span>Administrator permission required for changes</span>
        </span>
      </div>

      {!currentUser?.accessToken && !currentUser?.role && (
        <div className="spatial-operational rounded-[10px] border-status-warning-border bg-status-warning-surface/90 px-4 py-3 text-sm font-semibold text-status-warning flex items-center gap-2">
          <i className="ti ti-lock text-base shrink-0" aria-hidden="true" />
          <span>Authorized sign-in required.</span>
        </div>
      )}

      {error && (
        <div role="alert" className="spatial-operational border-status-danger-border bg-status-danger-surface/90 p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      <section className="spatial-glass overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-border-subtle">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-bold font-display text-txt-primary">Site capabilities</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-mono font-bold bg-surface/75 border border-border-subtle text-txt-secondary">
              {enabledCount}/{flags.length} enabled · {siteId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!canManage && <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-surface/75 border border-border-subtle text-txt-secondary">Read-only</span>}
            <button onClick={() => void loadFlags()} className="rounded-[10px] border border-border-default bg-surface/70 px-3 py-1.5 text-xs font-semibold text-txt-secondary hover:text-txt-primary hover:bg-surface">
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-txt-muted">Loading feature controls…</div>
        ) : flags.length === 0 ? (
          <div className="p-8 text-center text-sm text-txt-muted">No feature controls configured.</div>
        ) : (
          <div className="divide-y divide-border-subtle bg-surface/40">
            {flags.map(flag => (
              <div key={flag.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-primary-surface/35 transition-colors">
                <div className="min-w-0 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-txt-primary">{flag.label}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${flag.enabled ? 'bg-status-success-surface text-status-success' : 'bg-surface border border-border-subtle text-txt-muted'}`}>
                    {flag.enabled ? 'On' : 'Off'}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface/75 border border-border-subtle text-txt-muted">
                    {flag.persisted ? 'Site override' : 'Default'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={flag.enabled}
                  aria-label={`Turn ${flag.label} ${flag.enabled ? 'off' : 'on'}`}
                  title={flag.description || undefined}
                  disabled={!canManage || pendingKey === flag.key}
                  onClick={() => void toggleFlag(flag)}
                  className={`w-12 h-7 rounded-full relative transition-colors duration-200 shrink-0 outline-none p-0.5 ${flag.enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className={`block w-6 h-6 rounded-full bg-white shadow-xs transition-transform duration-200 ${flag.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
