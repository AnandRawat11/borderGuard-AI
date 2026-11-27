import React, { useState, useEffect, useRef } from 'react';

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
      className="fixed inset-0 z-[250] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-surface border border-border-default rounded-2xl w-full max-w-[480px] overflow-hidden shadow-2xl text-txt-primary">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-default bg-surface-subtle">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-xs ${
            isFalsePositive ? 'bg-[#fff4e4] text-[#c77a21]' : 'bg-[#e6f7f5] text-[#0b8d8b]'
          }`}>
            <i className={`ti ${isFalsePositive ? 'ti-alert-circle' : 'ti-edit'}`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="reason-modal-title" className="text-sm font-bold font-display text-txt-primary truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-txt-muted truncate m-0 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            aria-label="Close dialog"
            className="w-7 h-7 rounded-lg text-txt-muted hover:text-txt-primary flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="ti ti-x text-sm"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Quick Select Buttons */}
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
                  className={`text-[11px] px-3 py-1.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    reason === r
                      ? 'bg-[#0b8d8b] text-white border-transparent font-semibold shadow-xs'
                      : 'bg-surface-subtle text-txt-primary border-border-default hover:border-[#0b8d8b]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Text Area */}
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
              className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs p-3 outline-none focus:border-[#0b8d8b] transition-colors placeholder:text-txt-muted"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-default">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-txt-muted hover:text-txt-primary bg-surface border border-border-default transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reason.trim()}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer ${
                !reason.trim()
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                  : isFalsePositive
                  ? 'bg-[#c77a21] hover:bg-[#b06a18]'
                  : 'bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e]'
              }`}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
