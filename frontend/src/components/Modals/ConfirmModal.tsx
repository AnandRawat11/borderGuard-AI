import React, { useEffect, useRef } from 'react';

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
      className="fixed inset-0 z-[250] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-surface border border-border-default rounded-2xl w-full max-w-[420px] overflow-hidden shadow-2xl text-txt-primary">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-default bg-surface-subtle">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-xs ${
            isDestructive ? 'bg-[#fff0f1] text-[#c84f58]' : 'bg-[#e6f7f5] text-[#0b8d8b]'
          }`}>
            <i className={`ti ${isDestructive ? 'ti-alert-triangle' : 'ti-help-circle'}`}></i>
          </div>
          <h3 id="confirm-modal-title" className="text-sm font-bold font-display text-txt-primary flex-1 truncate">
            {title}
          </h3>
          <button
            onClick={onCancel}
            aria-label="Close dialog"
            className="w-7 h-7 rounded-lg text-txt-muted hover:text-txt-primary flex items-center justify-center transition-colors"
          >
            <i className="ti ti-x text-sm"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-xs text-txt-muted leading-relaxed m-0">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-surface-subtle border-t border-border-default">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-txt-muted hover:text-txt-primary bg-surface border border-border-default transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
              isDestructive
                ? 'bg-[#c84f58] hover:bg-[#b03e46]'
                : 'bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
