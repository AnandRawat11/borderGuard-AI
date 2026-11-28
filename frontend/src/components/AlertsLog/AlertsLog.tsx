import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useApp, TYPE_META } from '../../context/AppContext';
import {
  api,
  LedgerVerifyResponse,
} from '../../services/api';
import { AlertState } from '../../types';
import { ReasonPromptModal } from '../Modals/ReasonPromptModal';
import { SpatialOverlay, SPATIAL_SPRING } from '../Spatial/MotionPrimitives';

interface AlertsLogProps {
  mode?: 'alerts' | 'vault';
}

export const AlertsLog: React.FC<AlertsLogProps> = ({ mode = 'alerts' }) => {
  const {
    alerts,
    cams,
    openLightbox,
    currentUser,
    updateAlertState,
    showNotice,
    escalateAlert,
    bulkUpdateAlerts
  } = useApp();

  const [filterType, setFilterType] = useState<string>('');
  const [filterSev, setFilterSev] = useState<string>('');
  const [filterCam, setFilterCam] = useState<string>('');
  const [filterState, setFilterState] = useState<string>('');
  const [filterProvenance, setFilterProvenance] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Bulk Selection State
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);

  // Grouping View Mode
  const [viewGrouping, setViewGrouping] = useState<'flat' | 'by-cam' | 'by-type'>('flat');

  // Escalation Modal State
  const [escalateTargetAlert, setEscalateTargetAlert] = useState<any>(null);
  const [escalateTarget, setEscalateTarget] = useState<string>('tactical_team');
  const [escalateDeadlineMins, setEscalateDeadlineMins] = useState<number>(5);
  const [escalateNotes, setEscalateNotes] = useState<string>('');
  const [isEscalating, setIsEscalating] = useState<boolean>(false);

  // Ledger verification state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [ledgerResult, setLedgerResult] = useState<LedgerVerifyResponse | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState<boolean>(false);
  const [tamperLoading, setTamperLoading] = useState<boolean>(false);
  const [exportLoading, setExportLoading] = useState<boolean>(false);

  // Reason Code Prompt Modal State
  const [promptTarget, setPromptTarget] = useState<{ id: string; targetState: 'resolved' | 'false_positive' } | null>(null);

  const canExport = currentUser?.role === 'supervisor' || currentUser?.role === 'admin';
  const isAdmin = currentUser?.role === 'admin';

  const isVault = mode === 'vault';
  const sourceAlerts = isVault
    ? alerts.filter(a => Boolean(a.snapshot || a.evidenceHash || a.reviewed))
    : alerts;

  const filtered = sourceAlerts.filter(a => {
    if (filterType && a.type !== filterType) return false;
    if (filterSev && a.sev !== filterSev) return false;
    if (filterCam && a.camId !== filterCam) return false;
    if (filterState && (a.state || (a.reviewed ? 'resolved' : 'open')) !== filterState) return false;
    if (filterProvenance && (a.provenance || 'detector') !== filterProvenance) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = a.id.toLowerCase().includes(q);
      const matchDetail = a.detail.toLowerCase().includes(q);
      const matchCam = a.camName.toLowerCase().includes(q);
      if (!matchId && !matchDetail && !matchCam) return false;
    }
    return true;
  }).sort((a, b) => b.ts.getTime() - a.ts.getTime());

  const handleBulkAction = async (state: AlertState, reasonCode?: string) => {
    if (selectedAlertIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      await bulkUpdateAlerts(selectedAlertIds, state, reasonCode);
      setSelectedAlertIds([]);
    } catch (err: any) {
      showNotice('error', `Bulk action failed: ${err.message}`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const toggleSelectAlert = (id: string) => {
    setSelectedAlertIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedAlertIds.length === filtered.length) {
      setSelectedAlertIds([]);
    } else {
      setSelectedAlertIds(filtered.map(a => a.id));
    }
  };

  const handleConfirmEscalation = async () => {
    if (!escalateTargetAlert) return;
    setIsEscalating(true);
    try {
      await escalateAlert(
        escalateTargetAlert.id,
        escalateTarget,
        escalateNotes || undefined,
        escalateDeadlineMins
      );
      setEscalateTargetAlert(null);
      setEscalateNotes('');
    } catch (err: any) {
      showNotice('error', `Escalation failed: ${err.message}`);
    } finally {
      setIsEscalating(false);
    }
  };

  const groupedSections = useMemo(() => {
    if (viewGrouping === 'by-cam') {
      const map: Record<string, typeof filtered> = {};
      filtered.forEach(a => {
        if (!map[a.camId]) map[a.camId] = [];
        map[a.camId].push(a);
      });
      return Object.entries(map).map(([camId, items]) => {
        const camObj = cams.find(c => c.id === camId);
        return {
          key: camId,
          title: camObj ? camObj.name : camId,
          subtitle: camObj?.location || 'Sentry Sector',
          icon: 'ti-video',
          items
        };
      });
    } else if (viewGrouping === 'by-type') {
      const map: Record<string, typeof filtered> = {};
      filtered.forEach(a => {
        if (!map[a.type]) map[a.type] = [];
        map[a.type].push(a);
      });
      return Object.entries(map).map(([type, items]) => ({
        key: type,
        title: TYPE_META[type]?.label || type.toUpperCase(),
        subtitle: `${items.length} events logged`,
        icon: TYPE_META[type]?.icon || 'ti-alert-triangle',
        items
      }));
    }
    return [{ key: 'all', title: 'All Events', subtitle: undefined, icon: undefined, items: filtered }];
  }, [filtered, viewGrouping, cams]);

  const handleExportCSV = async () => {
    if (!canExport) {
      showNotice('error', 'Supervisor or Administrator role required for audit CSV export.');
      return;
    }
    setExportLoading(true);
    try {
      await api.downloadAlertsCsv(currentUser?.accessToken);
      showNotice('success', 'Cryptographically verified CSV export downloaded.');
    } catch (err: any) {
      showNotice('error', `Server export failed: ${err.message}. To maintain audit integrity, offline downloads are prohibited.`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    setShowLedgerModal(true);
    try {
      const res = await api.verifyLedger(currentUser?.accessToken);
      setLedgerResult(res);
    } catch (err: any) {
      setLedgerResult({
        intact: false,
        checkedRecords: 0,
        message: err.message || 'Failed to verify ledger integrity'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTamperDemo = async () => {
    if (filtered.length === 0) return;
    if (!currentUser?.accessToken) {
      showNotice('error', 'Sign in with an Administrator account to run the tamper demonstration.');
      return;
    }
    const targetAlert = filtered[0];
    setTamperLoading(true);
    try {
      const token = currentUser.accessToken;
      await api.tamperDemo(targetAlert.id, token);
      showNotice('error', `Simulated database tamper injected on ${targetAlert.id}!`);
      // Re-verify immediately to display the live tampered breach!
      const res = await api.verifyLedger(token);
      setLedgerResult(res);
    } catch (err: any) {
      showNotice('error', 'Tamper demo failed: ' + err.message);
    } finally {
      setTamperLoading(false);
    }
  };

  const handleReasonSubmit = (reason: string) => {
    if (!promptTarget) return;
    updateAlertState(promptTarget.id, promptTarget.targetState, currentUser?.username || 'operator', reason);
    setPromptTarget(null);
  };

  const needsReviewCount = alerts.filter(a => !a.reviewed).length;
  const highPriorityCount = alerts.filter(a => a.sev === 'high').length;
  const reviewedCount = alerts.filter(a => a.reviewed).length;
  const activeSectorsCount = cams.filter(c => c.online).length;

  const weaponAlertsCount = alerts.filter(a => a.type === 'weapon').length;
  const intrusionAlertsCount = alerts.filter(a => a.type === 'intrusion').length;
  const anprAlertsCount = alerts.filter(a => a.type === 'anpr').length;
  const watchlistAlertsCount = alerts.filter(a => a.type === 'watchlist').length;
  const otherAlertsCount = alerts.filter(a => a.type !== 'weapon' && a.type !== 'intrusion' && a.type !== 'anpr' && a.type !== 'watchlist').length;

  const openStateCount = alerts.filter(a => !a.reviewed && (a.state === 'open' || !a.state)).length;
  const ackStateCount = alerts.filter(a => a.state === 'acknowledged').length;
  const resolvedStateCount = alerts.filter(a => a.state === 'resolved' || (a.reviewed && !a.state)).length;
  const fpStateCount = alerts.filter(a => a.state === 'false_positive').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto min-h-0 p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-transparent text-txt-primary scroll-smooth">
      {/* Header */}
      <header className="shrink-0">
        <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
          <span>{isVault ? 'Workspace' : 'Surveillance'}</span>
          <span>/</span>
          <span className="text-status-danger font-bold">
            {isVault ? 'Forensic Evidence Vault' : 'Real-Time Alert Feed'}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            {isVault ? 'Forensic Evidence Vault' : 'Live Alert Feed & Triage'}
          </h1>

          {isVault && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={handleExportCSV}
                disabled={!canExport || exportLoading}
                title={canExport ? 'Export audit-verified CSV report' : 'Requires Supervisor or Admin role'}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-xs font-bold transition-all ${
                  canExport
                    ? 'spatial-glass text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 cursor-pointer'
                    : 'bg-surface/45 border border-border-subtle text-txt-muted cursor-not-allowed opacity-55'
                }`}
              >
                <i className={`ti ${exportLoading ? 'ti-loader animate-spin' : 'ti-download'} text-sm`} />
                <span>Export CSV</span>
                {!canExport && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">(Supervisor)</span>}
              </button>

              <button
                onClick={handleVerifyIntegrity}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-white font-bold text-xs brand-button hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <i className="ti ti-shield-check text-sm" />
                <span>Verify Log Integrity</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Unified Spatial Glass Statistics Strip */}
      <section className="spatial-stats-strip shrink-0" aria-label="Alerts Log KPI Summary">
        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Needs review</span>
            <i className="ti ti-bell text-base text-status-danger" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-status-danger mt-1.5 tabular-nums">
            {String(needsReviewCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>High priority</span>
            <i className="ti ti-alert-triangle text-base text-status-warning" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-status-warning mt-1.5 tabular-nums">
            {String(highPriorityCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Reviewed today</span>
            <i className="ti ti-circle-check text-base text-info" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-info mt-1.5 tabular-nums">
            {String(reviewedCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Sentry cameras</span>
            <i className="ti ti-device-cctv text-base text-primary" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-primary mt-1.5 tabular-nums">
            {String(activeSectorsCount).padStart(2, '0')}
          </b>
        </div>
      </section>

      {/* Threat Distribution & Triage Lifecycle Strip */}
      <section className="spatial-glass p-4 shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-txt-primary m-0">
              {isVault ? 'Evidence Archive & Audit Intelligence' : 'Live Threat Intelligence & Triage Lifecycle'}
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-txt-muted font-mono">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
              SHA-256 Local Audit Chain
            </span>
            <span>Total: {sourceAlerts.length} Records</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <button
            onClick={() => setFilterType(filterType === 'weapon' ? '' : 'weapon')}
            className={`p-2.5 rounded-[10px] border text-left transition-all cursor-pointer ${
              filterType === 'weapon'
                ? 'bg-rose-500/12 border-rose-500/60 shadow-xs'
                : 'bg-surface/65 border-border-subtle hover:border-rose-400 hover:bg-surface/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <i className="ti ti-flame" />
                <span>Guns &amp; Weapons</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
                {weaponAlertsCount}
              </span>
            </div>
          </button>

          <button
            onClick={() => setFilterType(filterType === 'intrusion' ? '' : 'intrusion')}
            className={`p-2.5 rounded-[10px] border text-left transition-all cursor-pointer ${
              filterType === 'intrusion'
                ? 'bg-amber-500/12 border-amber-500/60 shadow-xs'
                : 'bg-surface/65 border-border-subtle hover:border-amber-400 hover:bg-surface/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <i className="ti ti-walk" />
                <span>Fence Intrusion</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                {intrusionAlertsCount}
              </span>
            </div>
          </button>

          <button
            onClick={() => setFilterType(filterType === 'watchlist' ? '' : 'watchlist')}
            className={`p-2.5 rounded-[10px] border text-left transition-all cursor-pointer ${
              filterType === 'watchlist'
                ? 'bg-primary-surface border-primary-border shadow-xs'
                : 'bg-surface/65 border-border-subtle hover:border-cyan-400 hover:bg-surface/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <i className="ti ti-user-exclamation" />
                <span>Watchlist POI</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums">
                {watchlistAlertsCount}
              </span>
            </div>
          </button>

          <button
            onClick={() => setFilterType(filterType === 'anpr' ? '' : 'anpr')}
            className={`p-2.5 rounded-[10px] border text-left transition-all cursor-pointer ${
              filterType === 'anpr'
                ? 'bg-purple-500/12 border-purple-500/60 shadow-xs'
                : 'bg-surface/65 border-border-subtle hover:border-purple-400 hover:bg-surface/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <i className="ti ti-car" />
                <span>ANPR Vehicles</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
                {anprAlertsCount}
              </span>
            </div>
          </button>

          <button
            onClick={() => setFilterType(filterType === 'loiter' ? '' : 'loiter')}
            className={`p-2.5 rounded-[10px] border text-left transition-all cursor-pointer col-span-2 sm:col-span-1 ${
              filterType === 'loiter'
                ? 'bg-primary-surface border-primary-border shadow-xs'
                : 'bg-surface/65 border-border-subtle hover:border-teal-400 hover:bg-surface/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                <i className="ti ti-clock-pause" />
                <span>Loiter &amp; Night</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-teal-600 dark:text-teal-400 tabular-nums">
                {otherAlertsCount}
              </span>
            </div>
          </button>
        </div>

        <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10.5px]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-txt-muted">Triage Resolution Pipeline:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-txt-primary font-bold">{openStateCount} Open</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-txt-primary font-bold">{ackStateCount} Acknowledged</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-txt-primary font-bold">{resolvedStateCount} Resolved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-txt-primary font-bold">{fpStateCount} False Pos</span>
            </div>
          </div>
          <div className="text-txt-muted text-[10px] font-mono">
            Resolution Velocity: <strong className="text-emerald-600 dark:text-emerald-400">{alerts.length > 0 ? Math.round((resolvedStateCount / alerts.length) * 100) : 0}%</strong> cleared
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <div className="spatial-glass p-3 flex flex-wrap gap-2 items-center shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search alerts"
            placeholder="Search alert ID, camera, detail..."
            className="w-full bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
          />
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">All Alert Types</option>
          <option value="intrusion">Virtual Fence Intrusion</option>
          <option value="weapon">Guns, Firearms &amp; Prohibited Weapons</option>
          <option value="watchlist">Watchlist Candidate</option>
          <option value="anpr">ANPR Plate</option>
          <option value="loiter">Loitering</option>
          <option value="night">Night Movement</option>
        </select>

        <select
          value={filterSev}
          onChange={e => setFilterSev(e.target.value)}
          className="bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">All Severity</option>
          <option value="high">High (Critical)</option>
          <option value="med">Medium (Warning)</option>
          <option value="low">Low (Info)</option>
        </select>

        <select
          value={filterCam}
          onChange={e => setFilterCam(e.target.value)}
          className="bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">All Cameras</option>
          {cams.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filterState}
          onChange={e => setFilterState(e.target.value)}
          className="bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">All Lifecycle States</option>
          <option value="open">Open (Unreviewed)</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>

        <select
          value={filterProvenance}
          onChange={e => setFilterProvenance(e.target.value)}
          className="bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">All Provenance</option>
          <option value="detector">Live Detector AI</option>
          <option value="simulation">Simulation</option>
        </select>

        {/* Grouping Mode with Spring Indicator */}
        <div className="flex items-center rounded-[10px] border border-border-default p-0.5 bg-surface/65 shrink-0">
          {([
            { id: 'flat', label: 'All Logs' },
            { id: 'by-cam', label: 'By Camera' },
            { id: 'by-type', label: 'By Threat' },
          ] as const).map(tab => {
            const active = viewGrouping === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setViewGrouping(tab.id)}
                className={`relative px-2.5 py-1 rounded-[8px] text-xs font-bold transition-colors cursor-pointer ${
                  active ? 'text-primary-text' : 'text-txt-muted hover:text-txt-primary'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={`alerts-grouping-${mode}`}
                    transition={SPATIAL_SPRING}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[8px] brand-button pointer-events-none"
                  />
                )}
                <span className="relative z-[1]">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <span className="text-xs text-txt-muted font-mono ml-auto">
          Showing {filtered.length} of {sourceAlerts.length} {isVault ? 'evidence records' : 'events'}
        </span>
      </div>

      {/* Level 5 Operational Table */}
      <section className="spatial-operational overflow-hidden relative shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[850px]">
            <thead>
              <tr className="bg-primary-surface/45 dark:bg-white/5 border-b border-border-default text-txt-muted uppercase tracking-wider text-[9.5px] font-bold">
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedAlertIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="checkbox checkbox-xs rounded border-border-default accent-primary cursor-pointer"
                    aria-label="Select all alerts"
                  />
                </th>
                <th className="px-4 py-3 text-left">Event / UID</th>
                <th className="px-4 py-3 text-left">Camera / Sector</th>
                <th className="px-4 py-3 text-left">Provenance</th>
                <th className="px-4 py-3 text-left">Conf</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Lifecycle State</th>
                <th className="px-4 py-3 text-left">Recorded</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <i className="ti ti-inbox text-3xl text-txt-muted opacity-50" />
                    <div className="text-xs font-bold text-txt-primary mt-2">No matching alerts found</div>
                  </td>
                </tr>
              ) : (
                groupedSections.map(section => (
                  <React.Fragment key={section.key}>
                    {groupedSections.length > 1 && (
                      <tr className="bg-surface-subtle/80 border-y border-border-default">
                        <td colSpan={9} className="px-4 py-2 font-bold text-xs text-primary">
                          <div className="flex items-center gap-2">
                            <i className={`ti ${section.icon || 'ti-folder'} text-sm`} />
                            <span>{section.title}</span>
                            {section.subtitle && (
                              <span className="text-[10px] text-txt-muted font-normal">
                                • {section.subtitle}
                              </span>
                            )}
                            <span className="ml-auto text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-surface border border-border-default text-txt-muted">
                              {section.items.length} incidents
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {section.items.map(a => {
                      const currentState = a.state || (a.reviewed ? 'resolved' : 'open');
                      const isDetector = (a.provenance || 'detector') === 'detector';
                      const isHigh = a.sev === 'high';
                      const isMed = a.sev === 'med';
                      const isSelected = selectedAlertIds.includes(a.id);

                      return (
                        <tr
                          key={a.id}
                          className={`hover:bg-primary-surface dark:hover:bg-white/5 transition-colors ${
                            isSelected ? 'bg-primary-surface' : ''
                          }`}
                        >
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectAlert(a.id)}
                              className="checkbox checkbox-xs rounded border-border-default accent-primary cursor-pointer"
                              aria-label={`Select alert ${a.id}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-txt-primary flex items-center gap-1.5 flex-wrap">
                              <span>{a.detail}</span>
                              {isHigh && currentState === 'open' && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 border border-rose-500/30 animate-pulse">
                                  SLA ACTIVE
                                </span>
                              )}
                              {currentState === 'escalated' && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                  <i className="ti ti-arrow-badge-up text-[9px]" /> {a.escalationTarget || 'QRT'}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-txt-muted font-mono">{a.id} · {a.type} · Track {a.trackId || 'N/A'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-txt-primary">{a.camName.split('·')[0].trim()}</div>
                            <div className="text-[10px] text-txt-muted truncate max-w-[140px]">{a.location}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              isDetector ? 'bg-status-success-surface text-status-success' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                            }`}>
                              {isDetector ? 'Detector' : 'Simulation'}
                            </span>
                            {a.type === 'weapon' && (
                              <div className="mt-1">
                                {a.verificationStatus === 'potential' ? (
                                  <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                    Potential Weapon
                                  </span>
                                ) : (a.reviewed || a.verificationStatus === 'officer_reviewed') ? (
                                  <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                                    Officer-Reviewed
                                  </span>
                                ) : (
                                  <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 border border-rose-500/30">
                                    Verified AI Alert ({a.supportingDetections || 1} hits)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-txt-primary tabular-nums">
                            {a.confidence}%
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider ${
                              isHigh
                                ? 'bg-status-danger-surface text-status-danger'
                                : isMed
                                ? 'bg-status-warning-surface text-status-warning'
                                : 'bg-surface-muted dark:bg-white/10 text-txt-secondary dark:text-slate-300'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {a.sev}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold ${
                              currentState === 'open'
                                ? 'bg-status-warning-surface text-status-warning'
                                : currentState === 'acknowledged'
                                ? 'bg-info-surface text-info'
                                : currentState === 'escalated'
                                ? 'bg-status-danger-surface text-rose-600 dark:text-rose-300'
                                : currentState === 'false_positive'
                                ? 'bg-slate-100 dark:bg-white/10 text-slate-500'
                                : 'bg-status-success-surface text-status-success'
                            }`}>
                              {currentState === 'open' ? 'Needs review' : currentState === 'escalated' ? 'Escalated' : currentState}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-txt-muted tabular-nums">
                            {a.ts.toLocaleString('en-IN', { hour12: false })}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {currentState === 'open' ? (
                                <>
                                  <button
                                    onClick={() => updateAlertState(a.id, 'acknowledged')}
                                    title="Acknowledge Alert"
                                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                                  >
                                    Acknowledge
                                  </button>
                                  <button
                                    onClick={() => setEscalateTargetAlert(a)}
                                    title="Escalate Alert to Quick Reaction Team or Sector Lead"
                                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                                  >
                                    Escalate
                                  </button>
                                </>
                              ) : currentState === 'acknowledged' ? (
                                <>
                                  <button
                                    onClick={() => setPromptTarget({ id: a.id, targetState: 'resolved' })}
                                    title="Resolve Alert with Justification Note"
                                    className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                                  >
                                    Resolve
                                  </button>
                                  <button
                                    onClick={() => setEscalateTargetAlert(a)}
                                    title="Escalate Alert"
                                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                                  >
                                    Escalate
                                  </button>
                                </>
                              ) : currentState === 'escalated' ? (
                                <button
                                  onClick={() => setPromptTarget({ id: a.id, targetState: 'resolved' })}
                                  title="Resolve Escalated Alert"
                                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                                >
                                  Resolve
                                </button>
                              ) : (
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 px-1.5">
                                  Archived
                                </span>
                              )}

                              <button
                                onClick={() => openLightbox(a.id)}
                                title="Inspect Forensic Snapshot"
                                className="px-2.5 py-1 text-white brand-button text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                              >
                                Open →
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Floating Bulk Action Bar */}
      {selectedAlertIds.length > 0 && (
        <SpatialOverlay className="spatial-glass-overlay fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-txt-primary px-5 py-3 flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-surface text-primary font-black text-xs flex items-center justify-center">
              {selectedAlertIds.length}
            </span>
            <span className="text-xs font-semibold">Selected</span>
          </div>

          <div className="h-4 w-px bg-border-default" />

          <button
            onClick={() => handleBulkAction('acknowledged')}
            disabled={bulkActionLoading}
            className="px-3 py-1.5 rounded-[8px] bg-amber-500 hover:bg-amber-400 text-[#19182A] text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Acknowledge All
          </button>

          <button
            onClick={() => handleBulkAction('resolved', 'bulk_resolved_operator')}
            disabled={bulkActionLoading}
            className="px-3 py-1.5 rounded-[8px] bg-emerald-500 hover:bg-emerald-400 text-[#19182A] text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Resolve All
          </button>

          <button
            onClick={() => handleBulkAction('false_positive', 'false_alarm_bulk')}
            disabled={bulkActionLoading}
            className="px-3 py-1.5 rounded-[8px] bg-surface/80 border border-border-default hover:bg-surface text-txt-primary text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Mark False Alarm
          </button>

          <button
            onClick={() => setSelectedAlertIds([])}
            className="text-xs text-txt-muted hover:text-txt-primary transition-colors ml-1 cursor-pointer"
          >
            Clear
          </button>
        </SpatialOverlay>
      )}

      {/* Threat Escalation Modal */}
      {escalateTargetAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-md p-4">
          <SpatialOverlay className="ui-dialog spatial-glass-overlay w-full max-w-[500px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <i className="ti ti-arrow-badge-up text-lg text-status-danger" aria-hidden="true" />
                <div>
                  <div className="text-sm font-bold font-display text-txt-primary">Tactical Threat Escalation</div>
                  <div className="text-[10px] text-txt-muted font-mono">{escalateTargetAlert.id} • {escalateTargetAlert.camName}</div>
                </div>
              </div>
              <button
                onClick={() => setEscalateTargetAlert(null)}
                className="text-txt-muted hover:text-txt-primary p-1 cursor-pointer"
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-surface/65 border border-border-subtle p-3 rounded-[10px] text-xs">
                <div className="font-bold text-txt-primary">{escalateTargetAlert.detail}</div>
                <div className="text-txt-muted text-[11px] mt-0.5">{escalateTargetAlert.location}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">
                  Escalation Target
                </label>
                <select
                  value={escalateTarget}
                  onChange={(e) => setEscalateTarget(e.target.value)}
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="tactical_team">Quick Reaction Team (QRT Sector Patrol)</option>
                  <option value="supervisor">Duty Tactical Commander / Supervisor</option>
                  <option value="sector_lead">Brigade Sector Command Lead</option>
                  <option value="c2_dispatch">Military Command &amp; Control (C2) HQ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">
                  Response SLA Deadline
                </label>
                <select
                  value={escalateDeadlineMins}
                  onChange={(e) => setEscalateDeadlineMins(parseInt(e.target.value, 10))}
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs px-3 py-2 outline-none focus:border-primary"
                >
                  <option value={3}>3 Minutes (Critical Immediate Threat)</option>
                  <option value={5}>5 Minutes (Standard Tactical SLA)</option>
                  <option value={10}>10 Minutes (Investigative Dwell)</option>
                  <option value={15}>15 Minutes (Routine Check)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">
                  Tactical Notes &amp; Remarks
                </label>
                <textarea
                  value={escalateNotes}
                  onChange={(e) => setEscalateNotes(e.target.value)}
                  placeholder="Specify threat vector, suspect movement, weapons observed..."
                  rows={3}
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] text-txt-primary text-xs p-3 outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
                <button
                  onClick={() => setEscalateTargetAlert(null)}
                  className="px-4 py-2 rounded-[10px] text-xs font-semibold text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmEscalation}
                  disabled={isEscalating}
                  className="px-4 py-2 rounded-[10px] text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <i className={`ti ${isEscalating ? 'ti-loader animate-spin' : 'ti-send'}`} />
                  <span>Dispatch Escalation</span>
                </button>
              </div>
            </div>
          </SpatialOverlay>
        </div>
      )}

      {/* SHA-256 Hash-Chain Integrity Modal */}
      {showLedgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-md p-4">
          <SpatialOverlay className="ui-dialog spatial-glass-overlay w-full max-w-[660px] max-h-[92vh] flex flex-col overflow-hidden text-txt-primary">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2.5">
                <i
                  className={`ti ${ledgerResult?.intact ? 'ti-shield-check text-status-success' : 'ti-shield-exclamation text-status-danger'} text-lg`}
                  aria-hidden="true"
                />
                <div className="text-sm font-bold font-display text-txt-primary">Cryptographic Ledger Integrity</div>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                aria-label="Close ledger modal"
                className="text-txt-muted hover:text-txt-primary hover:bg-primary-surface/60 rounded-lg text-base p-1"
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(92vh-125px)]">
              {isVerifying ? (
                <div className="p-10 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-xs text-txt-muted font-medium">Walking SHA-256 hash-chain...</div>
                </div>
              ) : ledgerResult ? (
                <>
                  <div>
                    <div className="text-xs font-bold font-display text-txt-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <i className="ti ti-database text-primary"></i>
                      Local SHA-256 Hash-Chain
                    </div>

                    <div className={`p-3.5 rounded-[10px] border flex items-start gap-3 ${
                      ledgerResult.intact
                        ? 'bg-status-success-surface border-status-success-border text-status-success'
                        : 'bg-status-danger-surface border-status-danger-border text-status-danger'
                    }`}>
                      <i className={`ti ${ledgerResult.intact ? 'ti-circle-check' : 'ti-alert-octagon'} text-xl shrink-0 mt-0.5`}></i>
                      <div>
                        <div className="text-xs font-bold tracking-wide font-display">
                          {ledgerResult.intact ? 'LOCAL LEDGER CHAIN VERIFIED INTACT' : 'CHAIN INTEGRITY COMPROMISED'}
                        </div>
                        <div className="text-[11px] mt-0.5 opacity-90">
                          {ledgerResult.message}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[10px] border border-border-subtle bg-surface/65 grid grid-cols-2 divide-x divide-border-subtle mt-3 overflow-hidden">
                      <div className="p-3">
                        <div className="text-[10px] text-txt-muted font-mono uppercase">Verified Records</div>
                        <div className="text-lg font-bold font-mono text-txt-primary mt-0.5 tabular-nums">{ledgerResult.checkedRecords}</div>
                      </div>
                      <div className="p-3">
                        <div className="text-[10px] text-txt-muted font-mono uppercase">Tamper Status</div>
                        <div className={`text-sm font-bold mt-1 ${ledgerResult.intact ? 'text-status-success' : 'text-status-danger'}`}>
                          {ledgerResult.intact ? '0 Tampered' : `Broken at seq #${ledgerResult.brokenAtSeq}`}
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface/65 p-3 rounded-[10px] border border-border-subtle mt-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-txt-primary">Forensic Tamper Detection Demo</div>
                        <button
                          onClick={handleTamperDemo}
                          disabled={tamperLoading || !isAdmin}
                          className={`px-3 py-1.5 text-xs font-bold rounded-[8px] transition-colors shrink-0 ${
                            isAdmin
                              ? 'bg-status-danger-surface text-status-danger border border-status-danger-border hover:bg-status-danger/20'
                              : 'bg-surface border border-border-subtle text-txt-muted cursor-not-allowed opacity-55'
                          }`}
                        >
                          {tamperLoading ? 'Injecting...' : 'Simulate Tamper (Admin)'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="px-5 py-3 border-t border-border-subtle flex justify-end shrink-0">
              <button
                onClick={() => setShowLedgerModal(false)}
                className="px-3.5 py-1.5 bg-surface/75 border border-border-default hover:bg-surface text-txt-primary text-xs font-semibold rounded-[10px] transition-colors"
              >
                Close
              </button>
            </div>
          </SpatialOverlay>
        </div>
      )}
      {/* Reason Prompt Modal for Operator Triage Action */}
      <ReasonPromptModal
        isOpen={Boolean(promptTarget)}
        title={promptTarget?.targetState === 'false_positive' ? 'Mark Alert as False Positive' : 'Resolve Security Incident'}
        subtitle={`Alert ID: ${promptTarget?.id}`}
        isFalsePositive={promptTarget?.targetState === 'false_positive'}
        submitLabel={promptTarget?.targetState === 'false_positive' ? 'Confirm False Positive' : 'Confirm Resolution'}
        onSubmit={handleReasonSubmit}
        onCancel={() => setPromptTarget(null)}
      />
    </div>
  );
};
