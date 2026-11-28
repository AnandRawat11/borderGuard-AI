import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { WatchlistEntry } from '../../types';
import { useApp } from '../../context/AppContext';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

const DEFAULT_SITE_ID = 'site-alpha';

export const WatchlistPage: React.FC = () => {
  const { currentUser, showNotice, refreshWatchlist } = useApp();
  const siteId = currentUser?.siteIds?.find(id => id !== '*') || DEFAULT_SITE_ID;
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'supervisor' || currentUser?.role === 'operator';

  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [referenceOnly, setReferenceOnly] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!infoOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInfoOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        setInfoOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [infoOpen]);

  const activeEntries = useMemo(() => entries.filter(entry => entry.active), [entries]);

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getWatchlist(siteId, currentUser?.accessToken);
      setEntries(response.entries);
      setReferenceOnly(response.referenceOnly || response.entries.some(entry => entry.referenceOnly));
    } catch (err: any) {
      setError(err?.message || 'Watchlist references could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.accessToken && !currentUser?.role) {
      setLoading(false);
      return;
    }
    void loadEntries();
  }, [siteId, currentUser?.accessToken]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !photo) {
      setError('Choose a clear face photo and enter a reference label.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.addWatchlistEntry(
        { name: name.trim(), photo },
        siteId,
        currentUser?.accessToken,
      );
      const localPhotoUrl = URL.createObjectURL(photo);
      const withPhoto: WatchlistEntry = {
        ...created,
        photoUrl: created.photoUrl || localPhotoUrl,
      };
      setEntries(previous => [withPhoto, ...previous]);
      setName('');
      setPhoto(null);
      const input = document.getElementById('watchlist-photo') as HTMLInputElement | null;
      if (input) input.value = '';
      showNotice('success', 'Watchlist reference saved securely.');
      await refreshWatchlist?.();
    } catch (err: any) {
      let msg = err?.message;
      if (!msg || msg === '[object Object]') {
        if (typeof err === 'string') msg = err;
        else if (err?.detail) {
          msg = Array.isArray(err.detail)
            ? err.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
            : String(err.detail);
        } else {
          msg = 'Reference could not be saved.';
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const deactivate = async (entry: WatchlistEntry) => {
    try {
      const updated = await api.deactivateWatchlistEntry(entry.id, siteId, currentUser?.accessToken);
      setEntries(previous => previous.map(item => item.id === updated.id ? updated : item));
      showNotice('success', `${entry.name} was deactivated.`);
      await refreshWatchlist?.();
    } catch (err: any) {
      setError(err?.message || 'Reference could not be deactivated.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-[1300px] w-full mx-auto space-y-5 bg-transparent">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-txt-muted">Operations / Identity references</div>
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display mt-0.5 leading-tight">
            Watchlist references
          </h1>
        </div>

        <div ref={infoRef} className="relative flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-border bg-primary-surface/80 px-3 py-1 text-xs font-bold text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>{referenceOnly ? 'Reference only — matching disabled' : 'Managed matcher active'}</span>
          </span>
          <button
            type="button"
            onClick={() => setInfoOpen(prev => !prev)}
            aria-label="Reference-only mode information"
            aria-expanded={infoOpen}
            className="w-7 h-7 rounded-full border border-border-default bg-surface/75 text-txt-muted hover:text-primary hover:bg-primary-surface/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="ti ti-info-circle text-sm" aria-hidden="true" />
          </button>

          {infoOpen && (
            <SpatialOverlay
              role="dialog"
              aria-label="Reference-only mode technical details"
              className="ui-popover spatial-glass-overlay absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] p-3.5 z-40 text-xs text-txt-secondary leading-relaxed"
            >
              <div className="font-bold text-txt-primary mb-1">
                {referenceOnly ? 'Reference-only mode' : 'Managed matcher mode'}
              </div>
              {referenceOnly
                ? 'Validates face presence, encrypts original bytes with AES-256-GCM, and stores SHA-256 metadata. Identity matching and confidence scoring remain disabled until a governed embedding provider is configured.'
                : 'Configured identity provider active. Review provenance and confidence policy before operational use.'}
            </SpatialOverlay>
          )}
        </div>
      </div>

      {!currentUser?.accessToken && !canManage && (
        <div className="spatial-operational rounded-[10px] border-amber-300/70 bg-status-warning-surface/90 px-4 py-3 text-sm font-semibold text-status-warning flex items-center gap-2">
          <i className="ti ti-lock text-base shrink-0" aria-hidden="true" />
          <span>Authorized sign-in required.</span>
        </div>
      )}

      {canManage && (
        <form onSubmit={handleSubmit} className="spatial-glass p-5">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold font-display text-txt-primary">Add a reference</h2>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-mono font-semibold bg-surface/75 border border-border-subtle text-txt-muted">{siteId}</span>
            </div>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-surface/75 border border-border-subtle text-txt-secondary">Encrypted at rest</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-txt-secondary">
              Label
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Person of interest 014"
                className="h-10 rounded-[10px] border border-border-default bg-surface/85 px-3 text-sm text-txt-primary outline-none focus:ring-2 focus:ring-primary-border"
                maxLength={160}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-txt-secondary">
              Face photo
              <input
                id="watchlist-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => setPhoto(event.target.files?.[0] || null)}
                className="h-10 rounded-[10px] border border-border-default bg-surface/85 px-2 py-1.5 text-xs text-txt-primary file:mr-3 file:rounded-md file:border-0 file:bg-primary-surface file:px-3 file:py-1 file:font-semibold file:text-primary"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 rounded-[10px] brand-button px-5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Add reference'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="spatial-operational border-status-danger-border bg-status-danger-surface/90 p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      <section className="spatial-glass overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-border-subtle">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-bold font-display text-txt-primary">Active references</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-mono font-bold bg-surface/75 border border-border-subtle text-txt-secondary">
              {activeEntries.length} · {siteId}
            </span>
          </div>
          <button onClick={() => void loadEntries()} className="rounded-[10px] border border-border-default bg-surface/70 px-3 py-1.5 text-xs font-semibold text-txt-secondary hover:text-txt-primary hover:bg-surface">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-txt-muted">Loading watchlist references…</div>
        ) : activeEntries.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm font-bold text-txt-primary">No references yet</div>
            {!currentUser?.accessToken && !canManage && (
              <div className="text-xs text-txt-muted mt-1">Authorized sign-in required.</div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle bg-surface/40">
            {activeEntries.map(entry => (
              <div key={entry.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 py-4 hover:bg-primary-surface/35 transition-colors">
                <div className="flex items-center gap-3.5 min-w-0">
                  {entry.photoUrl ? (
                    <img
                      src={entry.photoUrl}
                      alt={entry.name}
                      className="w-12 h-12 rounded-[10px] object-cover border border-primary-border shadow-xs shrink-0"
                    />
                  ) : (
                    <i className="ti ti-user text-xl text-txt-muted shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-txt-primary truncate">{entry.name}</h3>
                      <span className="rounded-full bg-status-success-surface px-2 py-0.5 text-[11px] font-bold text-status-success">Active</span>
                    </div>
                    <p className="text-xs text-txt-muted mt-0.5">{entry.faceCount || 1} face detected · {entry.matcherMode || 'reference_only'}</p>
                    <p className="font-mono text-[11px] text-txt-muted mt-0.5 truncate" title={entry.sha256 || undefined}>SHA-256: {entry.sha256?.slice(0, 20) || 'stored securely'}…</p>
                  </div>
                </div>
                <button onClick={() => void deactivate(entry)} className="self-start md:self-center rounded-[10px] border border-status-danger-border bg-surface/75 px-3 py-1.5 text-xs font-semibold text-status-danger hover:bg-status-danger-surface">
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
