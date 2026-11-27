import React, { useState } from 'react';
import { useApp, TYPE_META } from '../../context/AppContext';

export const AlertsPanel: React.FC = () => {
  const { alerts, openLightbox } = useApp();
  const [filter, setFilter] = useState<string>('all');

  const filteredAlerts = alerts
    .filter(a => filter === 'all' || a.type === filter)
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .slice(0, 30);

  const pendingCount = alerts.filter(a => !a.reviewed && (a.state || 'open') === 'open').length;
  const criticalCount = alerts.filter(a => a.sev === 'high').length;
  const warningCount = alerts.filter(a => a.sev === 'med').length;

  const timeAgo = (date: Date) => {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  const filterButtons = [
    { id: 'all', label: 'All' },
    { id: 'intrusion', label: 'Intrusion' },
    { id: 'weapon', label: 'Weapon' },
    { id: 'watchlist', label: 'Watchlist' },
    { id: 'anpr', label: 'ANPR' },
    { id: 'loiter', label: 'Loiter' },
    { id: 'night', label: 'Night' },
  ];

  return (
    <div className="w-full md:w-[320px] md:min-w-[320px] min-h-[200px] md:min-h-0 md:h-auto bg-surface border-t md:border-t-0 md:border-l border-border-default flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="p-3 px-3.5 pb-2.5 border-b border-border-default shrink-0 bg-surface-subtle">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold font-display text-txt-primary">Live Alert Stream</span>
          <span className="text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/25 px-2 py-0.5 rounded-full">
            {pendingCount} open
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
          {filterButtons.map(fb => (
            <button
              key={fb.id}
              onClick={() => setFilter(fb.id)}
              className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                filter === fb.id
                  ? 'bg-[#0b8d8b] text-white border-transparent font-bold shadow-xs'
                  : 'border-border-default bg-surface text-txt-muted hover:text-txt-primary'
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map(a => {
            const meta = TYPE_META[a.type] || TYPE_META.intrusion;
            const isNew = Date.now() - a.ts.getTime() < 60000;
            const currentState = a.state || (a.reviewed ? 'resolved' : 'open');
            const isHigh = a.sev === 'high';

            return (
              <div
                key={a.id}
                onClick={() => openLightbox(a.id)}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-colors duration-100 hover:bg-surface-subtle ${
                  isNew ? 'bg-rose-500/5 border-l-2 border-rose-500' : ''
                }`}
              >
                {/* Clean Threat Icon / Thumbnail */}
                {a.snapshot ? (
                  <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden border border-border-default relative shadow-xs">
                    <img src={a.snapshot} alt="Captured" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-sm shadow-xs ${
                    isHigh
                      ? 'bg-rose-500/10 text-rose-500'
                      : a.sev === 'med'
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-teal-500/10 text-[#0b8d8b]'
                  }`}>
                    <i className={`ti ${meta.icon}`} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-xs font-bold truncate ${
                      isHigh ? 'text-rose-600 dark:text-rose-400' : 'text-txt-primary'
                    }`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-txt-muted whitespace-nowrap">
                      {timeAgo(a.ts)}
                    </span>
                  </div>

                  <p className="text-xs text-txt-primary truncate mb-1 font-medium" title={a.detail}>
                    {a.detail}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-txt-muted">
                    <span className="truncate">{a.camName.split('·')[0].trim()}</span>
                    <span className={`text-[10px] font-semibold uppercase ${
                      currentState === 'open'
                        ? isHigh ? 'text-rose-500' : 'text-amber-500'
                        : 'text-emerald-500'
                    }`}>
                      {currentState}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-txt-muted flex flex-col items-center justify-center gap-2">
            <i className="ti ti-inbox text-2xl opacity-40" />
            <span className="text-xs">No alerts matching filter</span>
          </div>
        )}
      </div>

      {/* Footer Summary */}
      <div className="p-2.5 px-3.5 border-t border-border-default shrink-0 flex items-center justify-between bg-surface-subtle text-xs text-txt-muted">
        <span>Critical: <strong className="text-rose-500 font-mono">{criticalCount}</strong></span>
        <span>Warning: <strong className="text-amber-500 font-mono">{warningCount}</strong></span>
        <span>Total: <strong className="text-txt-primary font-mono">{alerts.length}</strong></span>
      </div>
    </div>
  );
};
