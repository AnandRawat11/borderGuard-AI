import React, { useState, useEffect } from 'react';
import { Alert } from '../../types';
import { api, TerrainEnrichment, TacticalRecommendation } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface PatrolModalProps {
  alert: Alert | null;
  onClose: () => void;
  onAcknowledge?: (alertId: string) => void;
}

export const PatrolModal: React.FC<PatrolModalProps> = ({ alert, onClose, onAcknowledge }) => {
  const { currentUser } = useApp();
  const [terrain, setTerrain] = useState<TerrainEnrichment | null>(null);
  const [recommendation, setRecommendation] = useState<TacticalRecommendation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reviewing, setReviewing] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!alert) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.getAlertTerrain(alert.id, currentUser?.accessToken).catch(() => null),
      api.getAlertRecommendation(alert.id, currentUser?.accessToken).catch(() => null)
    ]).then(([t, r]) => {
      if (isMounted) {
        setTerrain(t);
        setRecommendation(r);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [alert, currentUser]);

  const handleReview = async (newStatus: 'approved' | 'rejected') => {
    if (!recommendation) return;
    try {
      setReviewing(true);
      const updated = await api.reviewRecommendation(
        recommendation.id,
        newStatus,
        `Field action confirmed by ${currentUser?.username || 'operator'}`,
        currentUser?.accessToken
      );
      setRecommendation(updated);
      setActionNotice(`Tactical recommendation ${newStatus.toUpperCase()}`);
    } catch (err: any) {
      setActionNotice(`Review failed: ${err.message}`);
    } finally {
      setReviewing(false);
    }
  };

  const handleDispatchAck = () => {
    if (alert && onAcknowledge) {
      onAcknowledge(alert.id);
      setActionNotice('Dispatch acknowledged by patrol unit');
    }
  };

  if (!alert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-lg bg-surface border border-border-default rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-txt-primary"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrol-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-surface-subtle border-b border-border-default">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c84f58] animate-pulse" />
            <h2 id="patrol-modal-title" className="text-sm font-bold font-display text-txt-primary uppercase tracking-wide m-0">
              Patrol Tactical Dispatch Mode
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-txt-muted hover:text-txt-primary flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <i className="ti ti-x text-sm"></i>
          </button>
        </div>

        {/* Action Notice */}
        {actionNotice && (
          <div className="bg-[#eaf7ef] border-b border-emerald-500/30 px-5 py-2 text-xs text-[#25855c] flex items-center gap-2">
            <i className="ti ti-circle-check"></i>
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Top Target Card */}
          <div className="bg-surface-subtle border border-border-default rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-txt-muted">{alert.id} · {alert.camId}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#fff0f1] text-[#c84f58]">
                {alert.type.toUpperCase()} ({alert.confidence}%)
              </span>
            </div>
            <div className="text-sm font-bold text-txt-primary">{alert.location}</div>
            <div className="flex items-center gap-4 text-[11px] font-mono text-txt-muted">
              <span className="flex items-center gap-1">
                <i className="ti ti-clock text-[#0b8d8b]"></i>
                {new Date(alert.ts).toLocaleTimeString()}
              </span>
              <span className="flex items-center gap-1">
                <i className="ti ti-shield-check text-[#25855c]"></i>
                Provenance: {alert.provenance || 'detector'}
              </span>
            </div>
          </div>

          {/* GIS Topographical Context */}
          <div className="bg-surface-subtle border border-border-default rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-border-default pb-2">
              <span className="font-bold text-xs text-txt-primary flex items-center gap-1.5">
                <i className="ti ti-mountain text-[#0b8d8b]"></i>
                GIS Topographic Profile
              </span>
              <span className="text-[10px] text-txt-muted font-mono">
                {terrain?.datasetSource || 'SRTM-v3 / CartoDEM-v1'}
              </span>
            </div>

            {loading ? (
              <div className="text-center py-3 text-txt-muted font-mono text-xs">Loading spatial elevation data...</div>
            ) : terrain ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-surface p-2.5 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[10px] uppercase font-bold">Elevation</div>
                  <div className="font-mono font-bold text-txt-primary text-sm">{terrain.elevationM} m MSL</div>
                </div>
                <div className="bg-surface p-2.5 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[10px] uppercase font-bold">Slope Gradient</div>
                  <div className="font-mono font-bold text-txt-primary text-sm">{terrain.slopeDeg}° ({terrain.slopeDeg > 25 ? 'Steep' : 'Moderate'})</div>
                </div>
                <div className="bg-surface p-2.5 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[10px] uppercase font-bold">Sector Land Cover</div>
                  <div className="font-bold text-[#25855c] capitalize">{terrain.landCover.replace('_', ' ')}</div>
                </div>
                <div className="bg-surface p-2.5 rounded-lg border border-border-default">
                  <div className="text-txt-muted text-[10px] uppercase font-bold">Nearest Road / Route</div>
                  <div className="font-mono font-bold text-[#0b8d8b]">{terrain.nearestRoadDistanceM} m</div>
                </div>
              </div>
            ) : (
              <div className="text-txt-muted text-xs">Topographic elevation data unavailable for sector.</div>
            )}
          </div>

          {/* Tactical Recommendation Card */}
          <div className="bg-surface-subtle border border-border-default rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-border-default pb-2">
              <span className="font-bold text-xs text-txt-primary flex items-center gap-1.5">
                <i className="ti ti-compass text-[#c77a21]"></i>
                Tactical Guidance (Decision Support)
              </span>
              {recommendation && (
                <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase ${
                  recommendation.status === 'approved'
                    ? 'bg-[#eaf7ef] text-[#25855c]'
                    : 'bg-[#fff4e4] text-[#c77a21]'
                }`}>
                  {recommendation.status}
                </span>
              )}
            </div>

            {loading ? (
              <div className="text-center py-3 text-txt-muted font-mono text-xs">Evaluating tactical decision support...</div>
            ) : recommendation ? (
              <div className="space-y-2 text-xs">
                <p className="text-txt-primary font-medium leading-relaxed bg-surface p-3 rounded-lg border border-border-default m-0">
                  {recommendation.actionSummary}
                </p>
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-bold uppercase text-txt-muted">Recommended Steps:</div>
                  {recommendation.tacticalActions.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-txt-primary">
                      <span className="text-[#0b8d8b] font-bold">›</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                {/* Supervisor Approval Controls */}
                {currentUser?.role === 'supervisor' || currentUser?.role === 'admin' ? (
                  recommendation.status !== 'approved' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border-default">
                      <button
                        onClick={() => handleReview('approved')}
                        disabled={reviewing}
                        className="flex-1 bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <i className="ti ti-check"></i>
                        <span>Authorize Tactical Action</span>
                      </button>
                      <button
                        onClick={() => handleReview('rejected')}
                        disabled={reviewing}
                        className="bg-surface hover:bg-slate-100 text-txt-muted py-2 px-3 rounded-xl text-xs border border-border-default font-semibold cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            ) : (
              <div className="text-txt-muted text-xs">No tactical guidance generated for alert.</div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-subtle border-t border-border-default flex items-center gap-2">
          <button
            onClick={handleDispatchAck}
            className="flex-1 bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <i className="ti ti-radio"></i>
            <span>Acknowledge Dispatch</span>
          </button>
          <button
            onClick={onClose}
            className="bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-txt-muted py-2.5 px-4 rounded-xl text-xs border border-border-default font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
