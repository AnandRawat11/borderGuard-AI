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
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-[1300px] w-full mx-auto">
      <div className="flex flex-col gap-1 mb-6">
        <div className="text-sm text-txt-muted">System / Operational controls</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-txt-primary">Feature controls</h1>
        <p className="text-base text-txt-secondary max-w-3xl">
          Pause or resume supported site capabilities without changing deployment configuration. Changes are saved by the backend and recorded in the audit log.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-4 mb-6 text-sm text-amber-950 dark:text-amber-100">
        <strong>Administrator control:</strong> turning a capability off stops the supported API or worker path from creating new records. Existing alerts and evidence remain available for review. Governance approval still controls sensitive biometric capabilities separately.
      </div>

      {!currentUser?.accessToken && !currentUser?.role && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-4 text-base text-amber-950 dark:text-amber-100">
          Sign in with an authorised account to view site feature controls.
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/60 p-4 mb-5 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-border-default bg-surface shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-xl font-bold text-txt-primary">Site capabilities</h2>
            <p className="text-sm text-txt-muted mt-1">{enabledCount} of {flags.length} supported controls enabled · {siteId}</p>
          </div>
          <div className="flex items-center gap-2">
            {!canManage && <span className="rounded-full px-3 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-txt-secondary">Read-only</span>}
            <button onClick={() => void loadFlags()} className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-txt-secondary hover:bg-surface-subtle">
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-base text-txt-muted">Loading feature controls…</div>
        ) : flags.length === 0 ? (
          <div className="p-10 text-center text-base text-txt-muted">No feature controls were returned for this site.</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {flags.map(flag => (
              <div key={flag.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-txt-primary">{flag.label}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${flag.enabled ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                      {flag.enabled ? 'On' : 'Off'}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-surface-subtle text-txt-muted">
                      {flag.persisted ? 'Site override' : 'Default'}
                    </span>
                  </div>
                  <p className="text-sm text-txt-muted mt-1 max-w-2xl">{flag.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={flag.enabled}
                  aria-label={`Turn ${flag.label} ${flag.enabled ? 'off' : 'on'}`}
                  disabled={!canManage || pendingKey === flag.key}
                  onClick={() => void toggleFlag(flag)}
                  className={`w-12 h-7 rounded-full relative transition-colors duration-200 shrink-0 outline-none p-0.5 ${flag.enabled ? 'bg-[#0b8d8b]' : 'bg-slate-300 dark:bg-slate-700'} disabled:cursor-not-allowed disabled:opacity-60`}
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
