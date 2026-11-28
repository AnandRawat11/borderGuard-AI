import React, { useState, useEffect, useRef } from 'react';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

interface ReasonPromptModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  placeholder?: string;
  defaultReasons?: string[];
  submitLabel?: string;
  isFalsePositive?: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}

export const ReasonPromptModal: React.FC<ReasonPromptModalProps> = ({
  isOpen,
  title,
  subtitle,
  placeholder = 'Enter triage reason or operational notes...',
  defaultReasons = [
    'Camera calibration / environmental noise',
    'Authorized security personnel movement',
    'Wildlife / non-human intrusion',
    'Simulated test event verification',
    'Incident investigated and cleared on site'
  ],
  submitLabel = 'Confirm Action',
  isFalsePositive = false,
  onSubmit,
  onCancel,
}) => {
  const [reason, setReason] = useState<string>('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onSubmit(reason.trim());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-modal-title"
      className="fixed inset-0 z-[250] bg-slate-950/30 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <SpatialOverlay className="ui-dialog spatial-glass-overlay w-full max-w-[480px] overflow-hidden text-txt-primary">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-subtle">
          <i className={`ti ${isFalsePositive ? 'ti-alert-circle text-status-warning' : 'ti-edit text-primary'} text-lg shrink-0`} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h3 id="reason-modal-title" className="text-sm font-bold font-display text-txt-primary truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-txt-muted font-mono truncate m-0 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            aria-label="Close dialog"
            className="w-7 h-7 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-primary-surface/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-txt-muted mb-2 block">
              Quick Reason Codes:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {defaultReasons.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`text-[11px] px-3 py-1.5 rounded-[10px] border text-left transition-colors cursor-pointer ${
                    reason === r
                      ? 'bg-primary text-primary-text border-transparent font-semibold shadow-xs'
                      : 'bg-surface/70 text-txt-primary border-border-default hover:border-primary'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="reason-text" className="text-[10px] font-bold uppercase tracking-wider text-txt-muted mb-1.5 block">
              Audit Justification / Resolution Note (Required):
            </label>
            <textarea
              id="reason-text"
              ref={inputRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              required
              className="w-full bg-surface/90 border border-border-default rounded-[10px] text-txt-primary text-xs p-3 outline-none focus:border-primary transition-colors placeholder:text-txt-muted"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-[10px] text-xs font-semibold text-txt-secondary hover:text-txt-primary bg-surface/70 border border-border-default transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reason.trim()}
              className={`px-4 py-2 rounded-[10px] text-xs font-bold text-white shadow-xs transition-all cursor-pointer ${
                !reason.trim()
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                  : isFalsePositive
                  ? 'bg-status-warning hover:bg-amber-800'
                  : 'brand-button'
              }`}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </SpatialOverlay>
    </div>
  );
};
