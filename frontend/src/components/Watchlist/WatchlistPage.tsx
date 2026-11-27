import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { WatchlistEntry } from '../../types';
import { useApp } from '../../context/AppContext';
import { enrollReferencePhoto, removeReferenceSignature } from '../../services/faceMatcher';

const DEFAULT_SITE_ID = 'site-alpha';

export const WatchlistPage: React.FC = () => {
  const { currentUser, showNotice, refreshWatchlist } = useApp();
  const siteId = currentUser?.siteIds?.find(id => id !== '*') || DEFAULT_SITE_ID;
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'supervisor' || currentUser?.role === 'operator';

  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [referenceOnly, setReferenceOnly] = useState(true);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (withPhoto.photoUrl) {
        void enrollReferencePhoto(withPhoto.id, withPhoto.name, withPhoto.photoUrl);
      }
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
      removeReferenceSignature(entry.id);
      showNotice('success', `${entry.name} was deactivated.`);
      await refreshWatchlist?.();
    } catch (err: any) {
      setError(err?.message || 'Reference could not be deactivated.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-[1300px] w-full mx-auto">
      <div className="flex flex-col gap-1 mb-6">
        <div className="text-sm text-txt-muted">Operations / Identity references</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-txt-primary">Watchlist references</h1>
        <p className="text-base text-txt-secondary max-w-3xl">
          Add encrypted reference photos for supervised watchlist workflows. These records are not identity matches until a governed embedding provider is configured.
        </p>
      </div>

       <div className="rounded-2xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/80 dark:bg-cyan-950/30 p-4 mb-6 text-sm text-cyan-950 dark:text-cyan-100">
         <strong>{referenceOnly ? 'Reference-only mode:' : 'Managed matcher mode:'}</strong>{' '}
         {referenceOnly
           ? 'the service validates that an image contains a face, encrypts the original bytes, and stores integrity metadata. It does not claim recognition accuracy or return a match score.'
           : 'the configured identity provider is active; review its provenance and confidence policy before operational use.'}
       </div>

      {!currentUser?.accessToken && !canManage && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-4 text-base text-amber-950 dark:text-amber-100">
          Sign in with an authorised account to manage site watchlist references.
        </div>
      )}

      {canManage && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-txt-primary">Add a reference</h2>
              <p className="text-sm text-txt-muted mt-1">Site: {siteId}</p>
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-txt-secondary">Encrypted at rest</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-txt-secondary">
              Label
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Person of interest 014"
                className="h-11 rounded-xl border border-border-default bg-surface-subtle px-3 text-base text-txt-primary outline-none focus:ring-2 focus:ring-cyan-400"
                maxLength={160}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-txt-secondary">
              Face photo
              <input
                id="watchlist-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => setPhoto(event.target.files?.[0] || null)}
                className="h-11 rounded-xl border border-border-default bg-surface-subtle px-2 py-2 text-sm text-txt-primary file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-100 file:px-3 file:py-1 file:font-semibold file:text-cyan-900"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="h-11 rounded-xl bg-gradient-to-r from-cyan-700 to-teal-600 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Add reference'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/60 p-4 mb-5 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-border-default bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-xl font-bold text-txt-primary">Active references</h2>
            <p className="text-sm text-txt-muted mt-1">{activeEntries.length} active reference{activeEntries.length === 1 ? '' : 's'} for {siteId}</p>
          </div>
          <button onClick={() => void loadEntries()} className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-txt-secondary hover:bg-surface-subtle">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-base text-txt-muted">Loading watchlist references…</div>
        ) : activeEntries.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-lg font-bold text-txt-primary">No active references</div>
            <p className="text-base text-txt-muted mt-2">Add a clear face photo above, or wait for an authorised site administrator to configure the list.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {activeEntries.map(entry => (
              <div key={entry.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  {entry.photoUrl ? (
                    <img
                      src={entry.photoUrl}
                      alt={entry.name}
                      className="w-12 h-12 rounded-xl object-cover border border-cyan-500/40 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface-subtle border border-border-default flex items-center justify-center shrink-0 text-txt-muted">
                      <i className="ti ti-user text-xl" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-txt-primary truncate">{entry.name}</h3>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-200">Active</span>
                    </div>
                    <p className="text-sm text-txt-muted mt-1">{entry.faceCount || 1} face detected · {entry.matcherMode || 'reference_only'}</p>
                    <p className="font-mono text-xs text-txt-muted mt-1 truncate" title={entry.sha256 || undefined}>SHA-256: {entry.sha256?.slice(0, 20) || 'stored securely'}…</p>
                  </div>
                </div>
                <button onClick={() => void deactivate(entry)} className="self-start md:self-center rounded-lg border border-rose-200 dark:border-rose-900/60 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40">
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
