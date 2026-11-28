import React, { useEffect, useRef } from 'react';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    confirmBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-[250] bg-slate-950/30 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <SpatialOverlay className="ui-dialog spatial-glass-overlay w-full max-w-[420px] overflow-hidden text-txt-primary">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-subtle">
          <i className={`ti ${isDestructive ? 'ti-alert-triangle text-status-danger' : 'ti-help-circle text-primary'} text-lg shrink-0`} aria-hidden="true" />
          <h3 id="confirm-modal-title" className="text-sm font-bold font-display text-txt-primary flex-1 truncate">
            {title}
          </h3>
          <button
            onClick={onCancel}
            aria-label="Close dialog"
            className="w-7 h-7 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-primary-surface/60 flex items-center justify-center transition-colors"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs text-txt-secondary leading-relaxed m-0">
            {message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border-subtle">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-[10px] text-xs font-semibold text-txt-secondary hover:text-txt-primary bg-surface/70 border border-border-default transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-[10px] text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
              isDestructive
                ? 'bg-status-danger hover:bg-red-700'
                : 'brand-button'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </SpatialOverlay>
    </div>
  );
};
