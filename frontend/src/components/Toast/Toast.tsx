import React, { useEffect } from 'react';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

interface ToastProps {
  notice: { type: 'error' | 'success'; message: string };
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ notice, onDismiss }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [notice.message, onDismiss]);

  const isError = notice.type === 'error';

  return (
    <SpatialOverlay
      role="status"
      aria-label="System Notification"
      className={`ui-popover spatial-glass-overlay fixed bottom-4 right-4 z-[500] max-w-[calc(100vw-2rem)] flex items-center gap-3 px-4 py-3 ${
        isError ? 'border-status-danger-border text-status-danger' : 'border-status-success-border text-status-success'
      }`}
    >
      <i className={`ti ${isError ? 'ti-alert-circle' : 'ti-circle-check'} text-lg shrink-0`} aria-hidden="true" />
      <span className="text-xs text-txt-primary font-medium">{notice.message}</span>
      <button
        onClick={onDismiss}
        className="text-txt-muted hover:text-txt-primary transition-colors p-0.5 ml-1"
        aria-label="Dismiss notification"
      >
        <i className="ti ti-x text-sm" />
      </button>
    </SpatialOverlay>
  );
};
