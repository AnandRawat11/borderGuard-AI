import React, { useState, useEffect } from 'react';
import { Alert } from '../../types';
import { api, TacticalRecommendation } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

interface PatrolModalProps {
  alert: Alert | null;
  onClose: () => void;
  onAcknowledge?: (alertId: string) => void;
}

export const PatrolModal: React.FC<PatrolModalProps> = ({ alert, onClose, onAcknowledge }) => {
  const { currentUser } = useApp();
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

    api.getAlertRecommendation(alert.id, currentUser?.accessToken)
      .catch(() => null)
      .then((r) => {
        if (isMounted) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/30 backdrop-blur-md">
      <SpatialOverlay
        className="w-full max-w-lg ui-dialog spatial-glass-overlay overflow-hidden flex flex-col max-h-[92vh] text-txt-primary"
        role="dialog"
        aria-label="Patrol Tactical Dispatch Mode"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-danger animate-pulse" />
            <h2 id="patrol-modal-title" className="text-sm font-bold font-display text-txt-primary uppercase tracking-wide m-0">
              Patrol Tactical Dispatch Mode
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-primary-surface/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <i className="ti ti-x text-sm"></i>
          </button>
        </div>

        {actionNotice && (
          <div className="bg-status-success-surface border-b border-emerald-500/30 px-5 py-2 text-xs text-status-success flex items-center gap-2">
            <i className="ti ti-circle-check"></i>
            <span>{actionNotice}</span>
          </div>
        )}

        <div className="p-5 overflow-y-auto space-y-5 text-xs divide-y divide-border-subtle">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-txt-muted">{alert.id} · {alert.camId}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-status-danger-surface text-status-danger">
                {alert.type.toUpperCase()} ({alert.confidence}%)
              </span>
            </div>
            <div className="text-sm font-bold text-txt-primary">{alert.location}</div>
            <div className="flex items-center gap-4 text-[11px] font-mono text-txt-muted">
              <span className="flex items-center gap-1">
                <i className="ti ti-clock text-primary"></i>
                {new Date(alert.ts).toLocaleTimeString()}
              </span>
              <span className="flex items-center gap-1">
                <i className="ti ti-shield-check text-status-success"></i>
                Provenance: {alert.provenance || 'detector'}
              </span>
            </div>
          </div>

          <div className="pt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-txt-primary flex items-center gap-1.5">
                <i className="ti ti-compass text-status-warning"></i>
                Tactical Guidance (Decision Support)
              </span>
              {recommendation && (
                <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase ${
                  recommendation.status === 'approved'
                    ? 'bg-status-success-surface text-status-success'
                    : 'bg-status-warning-surface text-status-warning'
                }`}>
                  {recommendation.status}
                </span>
              )}
            </div>

            {loading ? (
              <div className="text-center py-3 text-txt-muted font-mono text-xs">Evaluating tactical decision support...</div>
            ) : recommendation ? (
              <div className="space-y-2.5 text-xs">
                <p className="text-txt-primary font-medium leading-relaxed bg-surface/75 p-3 rounded-[10px] border border-border-default m-0">
                  {recommendation.actionSummary}
                </p>
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-bold uppercase text-txt-muted">Recommended Steps:</div>
                  {recommendation.tacticalActions.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-txt-primary">
                      <span className="text-primary font-bold">›</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                {currentUser?.role === 'supervisor' || currentUser?.role === 'admin' ? (
                  recommendation.status !== 'approved' && (
                    <div className="flex items-center gap-2 pt-3 border-t border-border-subtle">
                      <button
                        onClick={() => handleReview('approved')}
                        disabled={reviewing}
                        className="flex-1 brand-button text-white font-bold py-2 px-3 rounded-[10px] text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <i className="ti ti-check"></i>
                        <span>Authorize Tactical Action</span>
                      </button>
                      <button
                        onClick={() => handleReview('rejected')}
                        disabled={reviewing}
                        className="bg-surface/75 hover:bg-surface text-txt-muted py-2 px-3 rounded-[10px] text-xs border border-border-default font-semibold cursor-pointer"
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

        <div className="p-4 border-t border-border-subtle flex items-center gap-2">
          <button
            onClick={handleDispatchAck}
            className="flex-1 brand-button text-white font-bold py-2.5 px-4 rounded-[10px] text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <i className="ti ti-radio"></i>
            <span>Acknowledge Dispatch</span>
          </button>
          <button
            onClick={onClose}
            className="bg-surface/75 hover:bg-surface text-txt-secondary py-2.5 px-4 rounded-[10px] text-xs border border-border-default font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </SpatialOverlay>
    </div>
  );
};
