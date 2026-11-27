import React, { useState, useMemo } from 'react';
import { useApp, TYPE_META } from '../../context/AppContext';
import {
  api,
  LedgerVerifyResponse,
  LedgerAnchor,
  LedgerAnchorVerifyResult,
  MerkleProof,
  MerkleProofVerifyResult,
  AlertProvenance as AlertProvenanceType,
  AlertProvenanceVerifyResult,
  AnchorProposal,
} from '../../services/api';
import { AlertState, AlertProvenance } from '../../types';
import { ReasonPromptModal } from '../Modals/ReasonPromptModal';

export const AlertsLog: React.FC = () => {
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

  // Blockchain Anchoring State (PRD v1.0)
  const [anchors, setAnchors] = useState<LedgerAnchor[]>([]);
  const [selectedAnchor, setSelectedAnchor] = useState<LedgerAnchor | null>(null);
  const [anchorVerifyResult, setAnchorVerifyResult] = useState<LedgerAnchorVerifyResult | null>(null);
  const [isAnchorVerifying, setIsAnchorVerifying] = useState<boolean>(false);
  const [isAnchoring, setIsAnchoring] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [showAnchorForm, setShowAnchorForm] = useState<boolean>(false);
  const [anchorFromSeq, setAnchorFromSeq] = useState<number>(0);
  const [anchorThroughSeq, setAnchorThroughSeq] = useState<number>(0);

  // Multisig & Tab State (Advanced Integrity)
  const [activeLedgerTab, setActiveLedgerTab] = useState<'anchors' | 'proposals'>('anchors');
  const [proposals, setProposals] = useState<AnchorProposal[]>([]);
  const [isProposalsLoading, setIsProposalsLoading] = useState<boolean>(false);
  const [showProposalForm, setShowProposalForm] = useState<boolean>(false);
  const [proposalFromSeq, setProposalFromSeq] = useState<number>(0);
  const [proposalThroughSeq, setProposalThroughSeq] = useState<number>(0);
  const [isCreatingProposal, setIsCreatingProposal] = useState<boolean>(false);
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Merkle Proof Inspection Modal State
  const [proofTargetAlertId, setProofTargetAlertId] = useState<string | null>(null);
  const [merkleProof, setMerkleProof] = useState<MerkleProof | null>(null);
  const [isProofLoading, setIsProofLoading] = useState<boolean>(false);
  const [proofVerifyResult, setProofVerifyResult] = useState<MerkleProofVerifyResult | null>(null);
  const [isProofVerifying, setIsProofVerifying] = useState<boolean>(false);

  // Model Provenance Inspection Modal State
  const [provTargetAlertId, setProvTargetAlertId] = useState<string | null>(null);
  const [alertProvenance, setAlertProvenance] = useState<AlertProvenanceType | null>(null);
  const [isProvLoading, setIsProvLoading] = useState<boolean>(false);
  const [provVerifyResult, setProvVerifyResult] = useState<AlertProvenanceVerifyResult | null>(null);
  const [isProvVerifying, setIsProvVerifying] = useState<boolean>(false);

  // Reason Code Prompt Modal State
  const [promptTarget, setPromptTarget] = useState<{ id: string; targetState: 'resolved' | 'false_positive' } | null>(null);

  const canExport = currentUser?.role === 'supervisor' || currentUser?.role === 'admin';
  const isAdmin = currentUser?.role === 'admin';
  const isSupervisor = currentUser?.role === 'supervisor' || currentUser?.role === 'admin';

  const filtered = alerts.filter(a => {
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

  const loadAnchors = async () => {
    try {
      const list = await api.getAnchors(undefined, undefined, currentUser?.accessToken);
      setAnchors(list);
      if (list.length > 0) {
        setSelectedAnchor(list[0]);
      }
    } catch {
      // Non-blocking for offline / disabled modes
    }
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    setShowLedgerModal(true);
    setAnchorVerifyResult(null);
    try {
      const res = await api.verifyLedger(currentUser?.accessToken);
      setLedgerResult(res);
      if (res.checkedRecords > 0) {
        setAnchorThroughSeq(Math.max(0, res.checkedRecords - 1));
        setProposalThroughSeq(Math.max(0, res.checkedRecords - 1));
      }
      await Promise.all([loadAnchors(), loadProposals()]);
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

  const loadProposals = async () => {
    setIsProposalsLoading(true);
    try {
      const list = await api.getAnchorProposals(undefined, undefined, currentUser?.accessToken);
      setProposals(list);
    } catch {
      // Non-blocking
    } finally {
      setIsProposalsLoading(false);
    }
  };

  const handleOpenMerkleProof = async (alertId: string) => {
    setProofTargetAlertId(alertId);
    setProofVerifyResult(null);
    setIsProofLoading(true);
    try {
      const p = await api.getAlertMerkleProof(alertId, currentUser?.accessToken);
      setMerkleProof(p);
    } catch (err: any) {
      showNotice('error', 'Failed to load Merkle proof: ' + err.message);
      setProofTargetAlertId(null);
    } finally {
      setIsProofLoading(false);
    }
  };

  const handleVerifyMerkleProof = async () => {
    if (!merkleProof) return;
    setIsProofVerifying(true);
    try {
      const res = await api.verifyMerkleProof(merkleProof, currentUser?.accessToken);
      setProofVerifyResult(res);
      if (res.valid) {
        showNotice('success', 'Merkle inclusion proof verified: alert is included in the root!');
      } else {
        showNotice('error', 'Merkle verification failed: ' + res.message);
      }
    } catch (err: any) {
      showNotice('error', 'Proof verification error: ' + err.message);
    } finally {
      setIsProofVerifying(false);
    }
  };

  const handleOpenProvenance = async (alertId: string) => {
    setProvTargetAlertId(alertId);
    setProvVerifyResult(null);
    setIsProvLoading(true);
    try {
      const p = await api.getAlertProvenance(alertId, currentUser?.accessToken);
      setAlertProvenance(p);
    } catch (err: any) {
      showNotice('error', 'Failed to load provenance: ' + err.message);
      setProvTargetAlertId(null);
    } finally {
      setIsProvLoading(false);
    }
  };

  const handleVerifyProvenance = async () => {
    if (!provTargetAlertId) return;
    setIsProvVerifying(true);
    try {
      const res = await api.verifyAlertProvenance(provTargetAlertId, currentUser?.accessToken);
      setProvVerifyResult(res);
      if (res.matches) {
        showNotice('success', 'Model and rule provenance verified intact.');
      } else {
        showNotice('error', 'Provenance mismatch: ' + res.message);
      }
    } catch (err: any) {
      showNotice('error', 'Provenance verification error: ' + err.message);
    } finally {
      setIsProvVerifying(false);
    }
  };

  const handleCreateProposal = async () => {
    if (!isAdmin) return;
    setIsCreatingProposal(true);
    try {
      const p = await api.createAnchorProposal({
        fromSequence: Number(proposalFromSeq),
        throughSequence: Number(proposalThroughSeq),
        expiresInHours: 24,
      }, currentUser?.accessToken);
      showNotice('success', `Created multisig proposal ${p.id}!`);
      setShowProposalForm(false);
      loadProposals();
    } catch (err: any) {
      showNotice('error', 'Failed to create proposal: ' + err.message);
    } finally {
      setIsCreatingProposal(false);
    }
  };

  const handleSignProposal = async (proposalId: string) => {
    if (!isSupervisor) return;
    try {
      const p = await api.signAnchorProposal(proposalId, undefined, currentUser?.accessToken);
      showNotice('success', `Signed proposal ${proposalId} (Status: ${p.status}, ${p.signaturesCount}/${p.thresholdRequired} signatures)`);
      loadProposals();
    } catch (err: any) {
      showNotice('error', 'Failed to sign proposal: ' + err.message);
    }
  };

  const handleRejectProposal = async () => {
    if (!rejectingProposalId || !rejectionReason.trim()) return;
    try {
      await api.rejectAnchorProposal(rejectingProposalId, rejectionReason, currentUser?.accessToken);
      showNotice('error', `Rejected proposal ${rejectingProposalId}`);
      setRejectingProposalId(null);
      setRejectionReason('');
      loadProposals();
    } catch (err: any) {
      showNotice('error', 'Failed to reject proposal: ' + err.message);
    }
  };

  const handleSubmitProposal = async (proposalId: string) => {
    if (!isAdmin) return;
    try {
      const p = await api.submitAnchorProposal(proposalId, currentUser?.accessToken);
      showNotice('success', `Submitted proposal ${proposalId} to blockchain (Status: ${p.status})`);
      loadProposals();
    } catch (err: any) {
      showNotice('error', 'Submission failed: ' + err.message);
    }
  };

  const handleVerifyAnchor = async (anchorId: string) => {
    if (!isSupervisor) {
      showNotice('error', 'Supervisor or Admin role required to verify blockchain anchors.');
      return;
    }
    setIsAnchorVerifying(true);
    try {
      const res = await api.verifyAnchor(anchorId, currentUser?.accessToken);
      setAnchorVerifyResult(res);
      if (res.verified) {
        showNotice('success', `On-chain anchor commitment verified against local ledger!`);
      } else {
        showNotice('error', `Anchor verification failed: ${res.message}`);
      }
      await loadAnchors();
    } catch (err: any) {
      showNotice('error', 'Blockchain verification failed: ' + err.message);
    } finally {
      setIsAnchorVerifying(false);
    }
  };

  const handleCreateAnchor = async () => {
    if (!isAdmin) {
      showNotice('error', 'Administrator role required to anchor ledger range to blockchain.');
      return;
    }
    setIsAnchoring(true);
    try {
      const created = await api.anchorLedger({
        fromSequence: Number(anchorFromSeq),
        throughSequence: Number(anchorThroughSeq),
        force: false,
      }, currentUser?.accessToken);
      showNotice('success', `Anchored sequence range [${created.fromSequence}, ${created.throughSequence}] (Anchor ID: ${created.id})`);
      setShowAnchorForm(false);
      await loadAnchors();
      setSelectedAnchor(created);
    } catch (err: any) {
      showNotice('error', 'Anchor creation failed: ' + err.message);
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleRetryAnchor = async (anchorId: string) => {
    if (!isAdmin) return;
    try {
      const retried = await api.retryAnchor(anchorId, currentUser?.accessToken);
      showNotice('success', `Retried anchor ${retried.id}: status is now ${retried.status}`);
      await loadAnchors();
      setSelectedAnchor(retried);
    } catch (err: any) {
      showNotice('error', 'Retry failed: ' + err.message);
    }
  };

  const handleCopyHash = (text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
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
    <div className="flex-1 flex flex-col h-full overflow-y-auto min-h-0 p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-canvas text-txt-primary scroll-smooth">
      
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <header className="shrink-0">
        <div className="text-[11px] text-[#708197] dark:text-slate-400 mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-[#c84f58] font-bold">Threats &amp; Forensic Log</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
              Threats &amp; Evidence Vault
            </h1>
            <p className="text-xs md:text-[13px] text-txt-muted mt-1 m-0">
              Tactical incident history, officer triage lifecycle, and cryptographically anchored chain-of-custody.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              disabled={!canExport || exportLoading}
              title={canExport ? 'Export audit-verified CSV report' : 'Requires Supervisor or Admin role'}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all shadow-xs ${
                canExport
                  ? 'bg-surface border-border-default text-txt-primary hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                  : 'bg-surface/50 border-border-default/50 text-txt-muted cursor-not-allowed opacity-50'
              }`}
            >
              <i className={`ti ${exportLoading ? 'ti-loader animate-spin' : 'ti-download'} text-sm`} />
              <span>Export CSV</span>
              {!canExport && <span className="text-[10px] text-amber-500 font-normal">(Supervisor)</span>}
            </button>

            {/* Cryptographic Ledger Verify Button */}
            <button
              onClick={handleVerifyIntegrity}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] shadow-[0_6px_14px_rgba(11,141,139,0.25)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-shield-check text-sm" />
              <span>Verify Log Integrity</span>
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          4 CURATED DISTINCTLY COLOURED METRIC CARDS
          1. Red (Needs Review)
          2. Orange (High Priority)
          3. Blue (Reviewed Records)
          4. Teal (Active Sentry Sectors)
          ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0" aria-label="Alerts Log KPI Summary">
        
        {/* CARD 1: RED - NEEDS REVIEW */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#c84f58]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#c84f58]/10 dark:bg-[#c84f58]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Needs review</span>
            <div className="w-8 h-8 rounded-lg bg-[#fff0f1] dark:bg-rose-950/40 text-[#c84f58] dark:text-rose-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ⚑
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#c84f58] dark:text-rose-300 mt-2 relative z-1 tabular-nums">
            {String(needsReviewCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Awaiting officer verification
          </small>
        </div>

        {/* CARD 2: ORANGE - HIGH PRIORITY */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#c77a21]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#c77a21]/10 dark:bg-[#c77a21]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">High priority</span>
            <div className="w-8 h-8 rounded-lg bg-[#fff4e4] dark:bg-amber-950/40 text-[#c77a21] dark:text-amber-300 flex items-center justify-center font-bold text-sm shadow-xs">
              !
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#c77a21] dark:text-amber-300 mt-2 relative z-1 tabular-nums">
            {String(highPriorityCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Critical breach alerts
          </small>
        </div>

        {/* CARD 3: BLUE - REVIEWED TODAY */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#5277d7]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#5277d7]/10 dark:bg-[#5277d7]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Reviewed today</span>
            <div className="w-8 h-8 rounded-lg bg-[#edf2ff] dark:bg-blue-950/40 text-[#5277d7] dark:text-blue-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ✓
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#5277d7] dark:text-blue-300 mt-2 relative z-1 tabular-nums">
            {String(reviewedCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Actioned and signed off
          </small>
        </div>

        {/* CARD 4: TEAL - ACTIVE SECTORS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#0b8d8b]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#0b8d8b]/10 dark:bg-[#0b8d8b]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Sentry cameras</span>
            <div className="w-8 h-8 rounded-lg bg-[#e6f7f5] dark:bg-teal-950/40 text-[#0b8d8b] dark:text-cyan-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ◉
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#0b8d8b] dark:text-cyan-300 mt-2 relative z-1 tabular-nums">
            {String(activeSectorsCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Operational boundary cameras
          </small>
        </div>

      </section>

      {/* =========================================================================
          EVENT VAULT THREAT MATRIX & INTEGRITY INTELLIGENCE
          ========================================================================= */}
      <section className="bg-surface border border-border-default rounded-2xl p-4 shadow-xs shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-txt-primary m-0">
              Vault Threat Intelligence &amp; Triage Lifecycle
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-txt-muted font-mono">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
              SHA-256 Merkle Ledger Anchored
            </span>
            <span>Total: {alerts.length} Records</span>
          </div>
        </div>

        {/* Threat Distribution & Filter Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {/* Guns & Weapons Pill */}
          <button
            onClick={() => setFilterType(filterType === 'weapon' ? '' : 'weapon')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'weapon'
                ? 'bg-rose-500/10 border-rose-500/60 shadow-sm ring-1 ring-rose-500/40'
                : 'bg-surface-subtle border-border-default hover:border-rose-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <i className="ti ti-flame" />
                <span>Guns &amp; Weapons</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-rose-600 dark:text-rose-400">
                {weaponAlertsCount}
              </span>
            </div>
            <div className="text-[9.5px] text-txt-muted mt-0.5 truncate">Handguns, Rifles, Knives</div>
          </button>

          {/* Intrusions Pill */}
          <button
            onClick={() => setFilterType(filterType === 'intrusion' ? '' : 'intrusion')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'intrusion'
                ? 'bg-amber-500/10 border-amber-500/60 shadow-sm ring-1 ring-amber-500/40'
                : 'bg-surface-subtle border-border-default hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <i className="ti ti-walk" />
                <span>Fence Intrusion</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-amber-600 dark:text-amber-400">
                {intrusionAlertsCount}
              </span>
            </div>
            <div className="text-[9.5px] text-txt-muted mt-0.5 truncate">Perimeter breaches</div>
          </button>

          {/* Watchlist POI Pill */}
          <button
            onClick={() => setFilterType(filterType === 'watchlist' ? '' : 'watchlist')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'watchlist'
                ? 'bg-cyan-500/10 border-cyan-500/60 shadow-sm ring-1 ring-cyan-500/40'
                : 'bg-surface-subtle border-border-default hover:border-cyan-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <i className="ti ti-user-exclamation" />
                <span>Watchlist POI</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-cyan-600 dark:text-cyan-400">
                {watchlistAlertsCount}
              </span>
            </div>
            <div className="text-[9.5px] text-txt-muted mt-0.5 truncate">Facial identity matches</div>
          </button>

          {/* ANPR Vehicle Pill */}
          <button
            onClick={() => setFilterType(filterType === 'anpr' ? '' : 'anpr')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              filterType === 'anpr'
                ? 'bg-purple-500/10 border-purple-500/60 shadow-sm ring-1 ring-purple-500/40'
                : 'bg-surface-subtle border-border-default hover:border-purple-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <i className="ti ti-car" />
                <span>ANPR Vehicles</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-purple-600 dark:text-purple-400">
                {anprAlertsCount}
              </span>
            </div>
            <div className="text-[9.5px] text-txt-muted mt-0.5 truncate">License plate records</div>
          </button>

          {/* Loiter & Night Movement Pill */}
          <button
            onClick={() => setFilterType(filterType === 'loiter' ? '' : 'loiter')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer col-span-2 sm:col-span-1 ${
              filterType === 'loiter'
                ? 'bg-teal-500/10 border-teal-500/60 shadow-sm ring-1 ring-teal-500/40'
                : 'bg-surface-subtle border-border-default hover:border-teal-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                <i className="ti ti-clock-pause" />
                <span>Loiter &amp; Night</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-teal-600 dark:text-teal-400">
                {otherAlertsCount}
              </span>
            </div>
            <div className="text-[9.5px] text-txt-muted mt-0.5 truncate">Dwelling &amp; IR movement</div>
          </button>
        </div>

        {/* Triage Pipeline Progress Ratio */}
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

      {/* =========================================================================
          FILTER TOOLBAR
          ========================================================================= */}
      <div className="bg-surface p-3.5 rounded-2xl border border-border-default shadow-xs flex flex-wrap gap-2.5 items-center shrink-0">
        {/* Search Box */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="⌕ Search alert ID, camera, detail..."
            className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs pl-3 pr-3 py-2 outline-none focus:border-[#0b8d8b]"
          />
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
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
          className="bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
        >
          <option value="">All Severity</option>
          <option value="high">High (Critical)</option>
          <option value="med">Medium (Warning)</option>
          <option value="low">Low (Info)</option>
        </select>

        <select
          value={filterCam}
          onChange={e => setFilterCam(e.target.value)}
          className="bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
        >
          <option value="">All Cameras</option>
          {cams.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filterState}
          onChange={e => setFilterState(e.target.value)}
          className="bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
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
          className="bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
        >
          <option value="">All Provenance</option>
          <option value="detector">Live Detector AI</option>
          <option value="simulation">Simulation</option>
        </select>

        {/* Grouping Mode */}
        <div className="flex items-center rounded-xl border border-border-default p-0.5 bg-surface-subtle shrink-0">
          <button
            onClick={() => setViewGrouping('flat')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewGrouping === 'flat' ? 'bg-[#0b8d8b] text-white shadow-xs' : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            All Logs
          </button>
          <button
            onClick={() => setViewGrouping('by-cam')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewGrouping === 'by-cam' ? 'bg-[#0b8d8b] text-white shadow-xs' : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            By Camera
          </button>
          <button
            onClick={() => setViewGrouping('by-type')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewGrouping === 'by-type' ? 'bg-[#0b8d8b] text-white shadow-xs' : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            By Threat
          </button>
        </div>

        <span className="text-xs text-txt-muted font-mono ml-auto">
          Showing {filtered.length} of {alerts.length} events
        </span>
      </div>

      {/* =========================================================================
          TABLE
          ========================================================================= */}
      <section className="bg-surface rounded-2xl border border-border-default shadow-xs overflow-hidden relative shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[850px]">
            <thead>
              <tr className="bg-[#f8fafc] dark:bg-white/5 border-b border-border-default text-[#96a3af] uppercase tracking-wider text-[9.5px] font-bold">
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedAlertIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="checkbox checkbox-xs rounded border-border-default accent-[#0b8d8b] cursor-pointer"
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
            <tbody className="divide-y divide-[#eff2f5] dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <i className="ti ti-inbox text-3xl text-txt-muted opacity-50" />
                    <div className="text-xs font-bold text-txt-primary mt-2">No matching alerts found</div>
                    <div className="text-[11px] text-txt-muted mt-0.5">Try adjusting your filters or search terms.</div>
                  </td>
                </tr>
              ) : (
                groupedSections.map(section => (
                  <React.Fragment key={section.key}>
                    {groupedSections.length > 1 && (
                      <tr className="bg-surface-subtle/80 border-y border-border-default">
                        <td colSpan={9} className="px-4 py-2 font-bold text-xs text-[#0b8d8b]">
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
                          className={`hover:bg-[#f6fafb] dark:hover:bg-white/5 transition-colors ${
                            isSelected ? 'bg-cyan-500/5 dark:bg-cyan-950/20' : ''
                          }`}
                        >
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectAlert(a.id)}
                              className="checkbox checkbox-xs rounded border-border-default accent-[#0b8d8b] cursor-pointer"
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
                              isDetector ? 'bg-[#eaf7ef] dark:bg-emerald-950/40 text-[#25855c] dark:text-emerald-300' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
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
                                ? 'bg-[#fff0f1] dark:bg-rose-950/40 text-[#c84f58] dark:text-rose-300'
                                : isMed
                                ? 'bg-[#fff4e4] dark:bg-amber-950/40 text-[#c77a21] dark:text-amber-300'
                                : 'bg-[#f0f3f6] dark:bg-white/10 text-[#617387] dark:text-slate-300'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-currentColor" />
                              {a.sev}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold ${
                              currentState === 'open'
                                ? 'bg-[#fff4e4] dark:bg-amber-950/40 text-[#c77a21] dark:text-amber-300'
                                : currentState === 'acknowledged'
                                ? 'bg-[#edf2ff] dark:bg-blue-950/40 text-[#5277d7] dark:text-blue-300'
                                : currentState === 'escalated'
                                ? 'bg-[#fff0f1] dark:bg-rose-950/40 text-rose-600 dark:text-rose-300'
                                : currentState === 'false_positive'
                                ? 'bg-slate-100 dark:bg-white/10 text-slate-500'
                                : 'bg-[#eaf7ef] dark:bg-emerald-950/40 text-[#25855c] dark:text-emerald-300'
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
                                onClick={() => handleOpenMerkleProof(a.id)}
                                title="Inspect Deterministic Merkle Inclusion Proof"
                                className="px-2.5 py-1 bg-surface border border-border-default hover:border-[#0b8d8b] text-txt-primary hover:text-[#0b8d8b] text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                              >
                                Merkle Proof
                              </button>

                              <button
                                onClick={() => openLightbox(a.id)}
                                title="Inspect Forensic Snapshot"
                                className="px-2.5 py-1 text-white bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] text-xs rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0b1e34] border border-cyan-500/40 text-white px-5 py-3 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.6)] flex items-center gap-3.5 animate-in fade-in slide-in-from-bottom-3 duration-200 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-400 text-[#092b3d] font-black text-xs flex items-center justify-center">
              {selectedAlertIds.length}
            </span>
            <span className="text-xs font-semibold">Selected</span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <button
            onClick={() => handleBulkAction('acknowledged')}
            disabled={bulkActionLoading}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#092b3d] text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            Acknowledge All
          </button>

          <button
            onClick={() => handleBulkAction('resolved', 'bulk_resolved_operator')}
            disabled={bulkActionLoading}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#092b3d] text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            Resolve All
          </button>

          <button
            onClick={() => handleBulkAction('false_positive', 'false_alarm_bulk')}
            disabled={bulkActionLoading}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            Mark False Alarm
          </button>

          <button
            onClick={() => setSelectedAlertIds([])}
            className="text-xs text-slate-400 hover:text-white transition-colors ml-1 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Threat Escalation Modal */}
      {escalateTargetAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border-default rounded-2xl w-full max-w-[500px] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-default bg-surface-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center text-sm font-bold">
                  <i className="ti ti-arrow-badge-up text-base" />
                </div>
                <div>
                  <div className="text-sm font-bold text-txt-primary">Tactical Threat Escalation</div>
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
              <div className="bg-surface-subtle border border-border-subtle p-3 rounded-xl text-xs">
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
                  className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
                >
                  <option value="tactical_team">Quick Reaction Team (QRT Sector Patrol)</option>
                  <option value="supervisor">Duty Tactical Commander / Supervisor</option>
                  <option value="sector_lead">Brigade Sector Command Lead</option>
                  <option value="c2_dispatch">Military Command & Control (C2) HQ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">
                  Response SLA Deadline
                </label>
                <select
                  value={escalateDeadlineMins}
                  onChange={(e) => setEscalateDeadlineMins(parseInt(e.target.value, 10))}
                  className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs px-3 py-2 outline-none focus:border-[#0b8d8b]"
                >
                  <option value={3}>3 Minutes (Critical Immediate Threat)</option>
                  <option value={5}>5 Minutes (Standard Tactical SLA)</option>
                  <option value={10}>10 Minutes (Investigative Dwell)</option>
                  <option value={15}>15 Minutes (Routine Check)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">
                  Tactical Notes & Remarks
                </label>
                <textarea
                  value={escalateNotes}
                  onChange={(e) => setEscalateNotes(e.target.value)}
                  placeholder="Specify threat vector, suspect movement, weapons observed..."
                  rows={3}
                  className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl text-txt-primary text-xs p-3 outline-none focus:border-[#0b8d8b]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  onClick={() => setEscalateTargetAlert(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmEscalation}
                  disabled={isEscalating}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <i className={`ti ${isEscalating ? 'ti-loader animate-spin' : 'ti-send'}`} />
                  <span>Dispatch Escalation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHA-256 Hash-Chain Integrity & Blockchain Anchoring Modal (PRD v1.0) */}
      {showLedgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border-default rounded-2xl w-full max-w-[660px] max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-default bg-surface-subtle shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${
                  ledgerResult?.intact ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                }`}>
                  <i className={`ti ${ledgerResult?.intact ? 'ti-shield-check' : 'ti-shield-alert'}`}></i>
                </div>
                <div>
                  <div className="text-sm font-bold font-display text-txt-primary">Cryptographic Ledger Integrity & Blockchain Anchoring</div>
                  <div className="text-[10px] text-txt-muted font-mono">Local SHA-256 Hash-Chain + External Blockchain Commitment</div>
                </div>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                aria-label="Close ledger modal"
                className="text-txt-muted hover:text-txt-primary text-base p-1"
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(92vh-125px)]">
              {isVerifying ? (
                <div className="p-10 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-instrument-400 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-xs text-rind-300 font-medium">Walking SHA-256 hash-chain and querying blockchain commitments...</div>
                </div>
              ) : ledgerResult ? (
                <>
                  {/* Section 1: Local SHA-256 Hash-Chain */}
                  <div>
                    <div className="text-xs font-bold font-display text-rind-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <i className="ti ti-database text-instrument-400"></i>
                      Local SHA-256 Hash-Chain
                    </div>

                    {/* Status Banner */}
                    <div className={`p-3.5 rounded-rad border flex items-start gap-3 ${
                      ledgerResult.intact
                        ? 'bg-leaf-900/50 border-leaf-500/30 text-leaf-500'
                        : 'bg-melon-d border-melon-500/40 text-melon-500'
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

                    {/* Verification Stats */}
                    <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                      <div className="bg-ink-800 p-3 rounded-rad border border-rind-500/15">
                        <div className="text-[10px] text-rind-500 font-mono uppercase">Verified Records</div>
                        <div className="text-lg font-bold text-rind-100 mt-0.5">{ledgerResult.checkedRecords}</div>
                      </div>
                      <div className="bg-ink-800 p-3 rounded-rad border border-rind-500/15">
                        <div className="text-[10px] text-rind-500 font-mono uppercase">Tamper Status</div>
                        <div className={`text-sm font-bold mt-1 ${ledgerResult.intact ? 'text-leaf-500' : 'text-melon-500'}`}>
                          {ledgerResult.intact ? '0 Tampered' : `Broken at seq #${ledgerResult.brokenAtSeq}`}
                        </div>
                      </div>
                    </div>

                    {/* Tamper Demo Action */}
                    <div className="bg-ink-800/70 p-3 rounded-rad border border-rind-500/15 mt-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-rind-200">Forensic Tamper Detection Demo</div>
                          <div className="text-[10.5px] text-rind-500">Simulates an unauthorized SQL alteration bypassing the API.</div>
                        </div>
                        <button
                          onClick={handleTamperDemo}
                          disabled={tamperLoading || !isAdmin}
                          className={`px-3 py-1.5 text-xs font-bold rounded-rad3 transition-colors shrink-0 ${
                            isAdmin
                              ? 'bg-melon-d text-melon-500 border border-melon-500/30 hover:bg-melon-500/20'
                              : 'bg-ink-850 text-rind-500 border border-rind-500/10 cursor-not-allowed opacity-50'
                          }`}
                        >
                          {tamperLoading ? 'Injecting...' : 'Simulate Tamper (Admin)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: External Blockchain Anchoring & Multisignature Anchoring (PRD v1.0) */}
                  <div className="pt-2 border-t border-rind-500/15">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActiveLedgerTab('anchors')}
                          className={`px-3 py-1 text-xs font-bold font-display uppercase tracking-wider rounded-rad3 transition-colors flex items-center gap-1.5 ${
                            activeLedgerTab === 'anchors'
                              ? 'bg-instrument-400 text-ink-950'
                              : 'bg-ink-800 text-rind-400 hover:text-rind-200 border border-rind-500/15'
                          }`}
                        >
                          <i className="ti ti-link"></i>
                          Anchors ({anchors.length})
                        </button>
                        <button
                          onClick={() => setActiveLedgerTab('proposals')}
                          className={`px-3 py-1 text-xs font-bold font-display uppercase tracking-wider rounded-rad3 transition-colors flex items-center gap-1.5 ${
                            activeLedgerTab === 'proposals'
                              ? 'bg-instrument-400 text-ink-950'
                              : 'bg-ink-800 text-rind-400 hover:text-rind-200 border border-rind-500/15'
                          }`}
                        >
                          <i className="ti ti-shield-lock"></i>
                          Multisig Proposals ({proposals.length})
                        </button>
                      </div>
                    </div>

                    {activeLedgerTab === 'anchors' ? (
                      selectedAnchor ? (
                        <div className="space-y-3">
                          {/* Anchor Status & Network Bar */}
                          <div className="flex items-center justify-between bg-ink-800 p-2.5 rounded-rad border border-rind-500/15">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-wider flex items-center gap-1 border ${
                                selectedAnchor.status === 'confirmed'
                                  ? 'bg-leaf-900/60 text-leaf-500 border-leaf-500/30'
                                  : selectedAnchor.status === 'submitted'
                                  ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/30'
                                  : selectedAnchor.status === 'failed' || selectedAnchor.status === 'verification_failed'
                                  ? 'bg-melon-d text-melon-500 border-melon-500/30'
                                  : 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                              }`}>
                                <i className={`ti ${
                                  selectedAnchor.status === 'confirmed' ? 'ti-circle-check' :
                                  selectedAnchor.status === 'submitted' ? 'ti-clock' :
                                  selectedAnchor.status === 'failed' ? 'ti-alert-triangle' : 'ti-loader'
                                }`}></i>
                                {selectedAnchor.status === 'confirmed' ? 'Confirmed On-Chain' : selectedAnchor.status}
                              </span>
                              <span className="text-xs font-bold text-rind-200 font-mono">{selectedAnchor.id}</span>
                            </div>

                            <div className="text-[10.5px] font-mono text-rind-400">
                              {selectedAnchor.network} (Chain ID: {selectedAnchor.chainId})
                            </div>
                          </div>

                          {/* Anchor Detail Grid */}
                          <div className="bg-ink-850 p-3 rounded-rad border border-rind-500/15 space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] text-rind-500 uppercase font-mono block">Anchored Range</span>
                                <span className="font-semibold text-rind-200">
                                  Seq #{selectedAnchor.fromSequence} → #{selectedAnchor.throughSequence}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-rind-500 uppercase font-mono block">Confirmations</span>
                                <span className="font-semibold text-rind-200">
                                  {selectedAnchor.confirmations} confs (Block #{selectedAnchor.blockNumber || 'Pending'})
                                </span>
                              </div>
                            </div>

                            {/* Merkle Root Hash with 1-click Copy */}
                            <div>
                              <div className="flex items-center justify-between text-[10px] text-rind-500 uppercase font-mono mb-1">
                                <span>Deterministic Merkle Root Hash</span>
                                {copiedHash && <span className="text-leaf-500 font-sans font-semibold">Copied to clipboard!</span>}
                              </div>
                              <div className="flex items-center gap-1.5 bg-ink-950 px-2 py-1.5 rounded border border-rind-500/20 font-mono text-[11px] text-rind-200">
                                <span className="truncate flex-1">{selectedAnchor.rootHash}</span>
                                <button
                                  onClick={() => handleCopyHash(selectedAnchor.rootHash)}
                                  className="text-rind-400 hover:text-rind-100 p-0.5 shrink-0 transition-colors"
                                  title="Copy 64-character SHA-256 root hash"
                                >
                                  <i className={`ti ${copiedHash ? 'ti-check text-leaf-500' : 'ti-copy'}`}></i>
                                </button>
                              </div>
                            </div>

                            {/* Transaction Hash & Explorer Link */}
                            <div className="flex items-center justify-between pt-1 border-t border-rind-500/10 text-[11px]">
                              <span className="text-rind-500">Tx Hash:</span>
                              {selectedAnchor.explorerUrl ? (
                                <a
                                  href={selectedAnchor.explorerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-instrument-400 hover:underline flex items-center gap-1 font-mono truncate max-w-[280px]"
                                >
                                  {selectedAnchor.transactionHash?.slice(0, 18)}...
                                  <i className="ti ti-external-link text-[10px]"></i>
                                </a>
                              ) : (
                                <span className="font-mono text-rind-400 truncate max-w-[280px]">
                                  {selectedAnchor.transactionHash || 'Pending transaction broadcast'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Live Verification Result Banner */}
                          {anchorVerifyResult && (
                            <div className={`p-3 rounded-rad border flex items-start gap-2.5 text-xs ${
                              anchorVerifyResult.verified
                                ? 'bg-leaf-900/40 border-leaf-500/30 text-leaf-500'
                                : 'bg-melon-d border-melon-500/40 text-melon-500'
                            }`}>
                              <i className={`ti ${anchorVerifyResult.verified ? 'ti-shield-check' : 'ti-shield-alert'} text-lg shrink-0 mt-0.5`}></i>
                              <div>
                                <div className="font-bold font-display">
                                  {anchorVerifyResult.verified
                                    ? 'ON-CHAIN COMMITMENT FULLY VERIFIED'
                                    : 'BLOCKCHAIN VERIFICATION ALERT'}
                                </div>
                                <div className="text-[11px] mt-0.5 opacity-90">{anchorVerifyResult.message}</div>
                                {anchorVerifyResult.onChainRootHash && (
                                  <div className="text-[10px] font-mono mt-1 opacity-80">
                                    Local: {anchorVerifyResult.localRootHash.slice(0, 16)}... | On-Chain: {anchorVerifyResult.onChainRootHash.slice(0, 16)}...
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Blockchain Action Bar */}
                          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                            <div className="flex items-center gap-2">
                              {isSupervisor && (
                                <button
                                  onClick={() => handleVerifyAnchor(selectedAnchor.id)}
                                  disabled={isAnchorVerifying}
                                  className="px-3 py-1.5 bg-instrument-400/10 hover:bg-instrument-400/20 text-instrument-400 border border-instrument-400/30 text-xs font-semibold rounded-rad3 flex items-center gap-1.5 transition-colors"
                                >
                                  <i className={`ti ${isAnchorVerifying ? 'ti-loader animate-spin' : 'ti-shield-check'}`}></i>
                                  {isAnchorVerifying ? 'Verifying On-Chain...' : 'Verify Anchor'}
                                </button>
                              )}

                              {isAdmin && selectedAnchor.status === 'failed' && (
                                <button
                                  onClick={() => handleRetryAnchor(selectedAnchor.id)}
                                  className="px-3 py-1.5 bg-amber-950/60 hover:bg-amber-950 text-amber-400 border border-amber-500/30 text-xs font-semibold rounded-rad3 flex items-center gap-1.5 transition-colors"
                                >
                                  <i className="ti ti-refresh"></i>
                                  Retry Anchor
                                </button>
                              )}
                            </div>

                            {isAdmin && !showAnchorForm && (
                              <button
                                onClick={() => setShowAnchorForm(true)}
                                className="px-3 py-1.5 bg-ink-800 hover:bg-ink-750 text-rind-200 border border-rind-500/20 text-xs font-semibold rounded-rad3 flex items-center gap-1.5 transition-colors"
                              >
                                <i className="ti ti-plus"></i>
                                Anchor Range...
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-ink-850 p-4 rounded-rad border border-rind-500/15 text-center">
                          <div className="text-xs text-rind-400 mb-2">No external blockchain anchors created for this site yet.</div>
                          {isAdmin ? (
                            <button
                              onClick={() => setShowAnchorForm(true)}
                              className="px-3.5 py-1.5 bg-instrument-400 text-ink-950 text-xs font-bold rounded-rad3 hover:bg-instrument-300 transition-colors inline-flex items-center gap-1.5"
                            >
                              <i className="ti ti-link"></i>
                              Anchor Initial Ledger Range
                            </button>
                          ) : (
                            <div className="text-[11px] text-rind-500">Administrator role required to create blockchain anchors.</div>
                          )}
                        </div>
                      )
                    ) : (
                      /* Multisig Proposals List View */
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-rind-400">
                            2-of-3 multisig policy: requires 2 distinct Admin/Supervisor signatures to commit.
                          </div>
                          {isAdmin && !showProposalForm && (
                            <button
                              onClick={() => setShowProposalForm(true)}
                              className="px-2.5 py-1 bg-instrument-400 text-ink-950 text-[11px] font-bold rounded-rad3 hover:bg-instrument-300 transition-colors flex items-center gap-1"
                            >
                              <i className="ti ti-plus"></i>
                              New Proposal
                            </button>
                          )}
                        </div>

                        {showProposalForm && isAdmin && (
                          <div className="bg-ink-800 p-3 rounded-rad border border-instrument-400/30 space-y-2.5">
                            <div className="text-xs font-bold text-rind-100 flex items-center justify-between">
                              <span>Create Multisig Anchor Proposal</span>
                              <button onClick={() => setShowProposalForm(false)} className="text-rind-500 hover:text-rind-200 text-xs">
                                Cancel
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <label className="text-[10px] text-rind-500 block mb-1">From Sequence #</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={proposalFromSeq}
                                  onChange={(e) => setProposalFromSeq(parseInt(e.target.value) || 0)}
                                  className="w-full bg-ink-900 border border-rind-500/20 rounded px-2 py-1 text-rind-100 font-mono text-xs focus:outline-none focus:border-instrument-400"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-rind-500 block mb-1">Through Sequence #</label>
                                <input
                                  type="number"
                                  min={proposalFromSeq}
                                  value={proposalThroughSeq}
                                  onChange={(e) => setProposalThroughSeq(parseInt(e.target.value) || 0)}
                                  className="w-full bg-ink-900 border border-rind-500/20 rounded px-2 py-1 text-rind-100 font-mono text-xs focus:outline-none focus:border-instrument-400"
                                />
                              </div>
                            </div>
                            <button
                              onClick={handleCreateProposal}
                              disabled={isCreatingProposal}
                              className="w-full py-1.5 bg-instrument-400 hover:bg-instrument-300 text-ink-950 text-xs font-bold rounded-rad3 transition-colors flex items-center justify-center gap-1"
                            >
                              <i className={`ti ${isCreatingProposal ? 'ti-loader animate-spin' : 'ti-shield-plus'}`}></i>
                              {isCreatingProposal ? 'Creating...' : 'Initialize Proposal (Admin)'}
                            </button>
                          </div>
                        )}

                        {isProposalsLoading ? (
                          <div className="p-6 text-center text-xs text-rind-400">Loading proposals...</div>
                        ) : proposals.length === 0 ? (
                          <div className="bg-ink-850 p-4 rounded-rad border border-rind-500/15 text-center text-xs text-rind-400">
                            No multisig proposals created yet.
                          </div>
                        ) : (
                          proposals.map((p) => (
                            <div key={p.id} className="bg-ink-850 p-3 rounded-rad border border-rind-500/15 space-y-2 text-xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                    p.status === 'confirmed' ? 'bg-leaf-900/60 text-leaf-500 border-leaf-500/30' :
                                    p.status === 'submitted' ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/30' :
                                    p.status === 'approved' ? 'bg-leaf-900 text-leaf-500 border-leaf-500/30' :
                                    p.status === 'rejected' ? 'bg-melon-d text-melon-500 border-melon-500/30' :
                                    'bg-amber-950/60 text-amber-400 border-amber-500/30'
                                  }`}>
                                    {p.status}
                                  </span>
                                  <span className="font-mono text-rind-200 font-bold">{p.id}</span>
                                </div>
                                <span className="font-mono text-[11px] text-rind-400">
                                  Seq #{p.fromSequence} → #{p.throughSequence}
                                </span>
                              </div>

                              <div className="bg-ink-900 p-2 rounded border border-rind-500/15 font-mono text-[10.5px] space-y-1">
                                <div className="text-rind-500 truncate">Root: <span className="text-rind-200">{p.merkleRoot}</span></div>
                                <div className="text-rind-500 truncate">Prov Root: <span className="text-leaf-400">{p.provenanceRoot}</span></div>
                                <div className="text-rind-400 text-[10px] pt-1 border-t border-rind-500/10 flex justify-between">
                                  <span>Signatures: {p.signaturesCount} / {p.thresholdRequired} required</span>
                                  {p.signatures.length > 0 && (
                                    <span className="text-rind-500">Signers: {p.signatures.map(s => s.signerRole).join(', ')}</span>
                                  )}
                                </div>
                              </div>

                              {p.signatures.some(s => s.status === 'rejected' && s.reason) && (
                                <div className="text-[11px] text-melon-500 bg-melon-d/20 p-2 rounded border border-melon-500/20">
                                  Rejection Reason: {p.signatures.find(s => s.status === 'rejected' && s.reason)?.reason}
                                </div>
                              )}

                              {/* Proposal Action Buttons */}
                              <div className="flex items-center gap-2 pt-1">
                                {isSupervisor && (p.status === 'proposed' || p.status === 'partially_signed') && (
                                  <>
                                    <button
                                      onClick={() => handleSignProposal(p.id)}
                                      className="px-2.5 py-1 bg-leaf-900 hover:bg-leaf-900/80 text-leaf-500 border border-leaf-500/30 text-[11px] rounded font-semibold transition-colors flex items-center gap-1"
                                    >
                                      <i className="ti ti-writing-sign"></i>
                                      Sign (2-of-3)
                                    </button>
                                    <button
                                      onClick={() => setRejectingProposalId(p.id)}
                                      className="px-2.5 py-1 bg-melon-d hover:bg-melon-500/20 text-melon-500 border border-melon-500/30 text-[11px] rounded font-semibold transition-colors"
                                    >
                                      Reject...
                                    </button>
                                  </>
                                )}

                                {isAdmin && p.status === 'approved' && (
                                  <button
                                    onClick={() => handleSubmitProposal(p.id)}
                                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-ink-950 text-[11px] rounded font-bold transition-colors flex items-center gap-1"
                                  >
                                    <i className="ti ti-arrow-up-circle"></i>
                                    Submit to Blockchain
                                  </button>
                                )}

                                {p.status === 'submitted' && (
                                  <span className="text-[10.5px] text-cyan-400 font-mono">
                                    Submitted (Tx: {p.transactionHash?.slice(0, 14)}...)
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Admin Sequence Range Creation Form */}
                    {activeLedgerTab === 'anchors' && showAnchorForm && isAdmin && (
                      <div className="bg-ink-800 p-3.5 rounded-rad border border-instrument-400/30 mt-3 space-y-3">
                        <div className="text-xs font-bold text-rind-100 flex items-center justify-between">
                          <span>Submit Ledger Range to Blockchain</span>
                          <button
                            onClick={() => setShowAnchorForm(false)}
                            className="text-rind-500 hover:text-rind-200 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10.5px] text-rind-500 block mb-1">From Sequence #</label>
                            <input
                              type="number"
                              min="0"
                              value={anchorFromSeq}
                              onChange={(e) => setAnchorFromSeq(parseInt(e.target.value) || 0)}
                              className="w-full bg-ink-900 border border-rind-500/20 rounded px-2.5 py-1 text-rind-100 font-mono text-xs focus:outline-none focus:border-instrument-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-rind-500 block mb-1">Through Sequence #</label>
                            <input
                              type="number"
                              min={anchorFromSeq}
                              value={anchorThroughSeq}
                              onChange={(e) => setAnchorThroughSeq(parseInt(e.target.value) || 0)}
                              className="w-full bg-ink-900 border border-rind-500/20 rounded px-2.5 py-1 text-rind-100 font-mono text-xs focus:outline-none focus:border-instrument-400"
                            />
                          </div>
                        </div>
                        <div className="text-[10.5px] text-rind-500">
                          Deterministic Merkle root will be calculated locally and anchored to the configured provider without publishing alert details or coordinates.
                        </div>
                        <button
                          onClick={handleCreateAnchor}
                          disabled={isAnchoring}
                          className="w-full py-1.5 bg-instrument-400 hover:bg-instrument-300 text-ink-950 text-xs font-bold rounded-rad3 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <i className={`ti ${isAnchoring ? 'ti-loader animate-spin' : 'ti-link'}`}></i>
                          {isAnchoring ? 'Calculating Root & Submitting...' : 'Commit Root to Blockchain'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-ink-850 border-t border-rind-500/15 flex justify-end shrink-0">
              <button
                onClick={() => setShowLedgerModal(false)}
                className="px-3.5 py-1.5 bg-ink-800 border border-rind-500/20 hover:border-rind-500/40 text-rind-200 text-xs font-semibold rounded-rad3 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
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
      {/* Merkle Proof Inspection Modal (FR-MP-2) */}
      {proofTargetAlertId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border-default rounded-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-default bg-surface-subtle shrink-0">
              <div className="flex items-center gap-2">
                <i className="ti ti-binary-tree text-[#0b8d8b] text-lg"></i>
                <div>
                  <div className="text-sm font-bold font-display text-txt-primary">Merkle Tree Inclusion Proof</div>
                  <div className="text-[10.5px] text-txt-muted font-mono">Single-Alert Verification Without Full-Ledger Scan</div>
                </div>
              </div>
              <button
                onClick={() => { setProofTargetAlertId(null); setMerkleProof(null); setProofVerifyResult(null); }}
                className="text-txt-muted hover:text-txt-primary text-base p-1"
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto max-h-[calc(90vh-120px)] text-xs">
              {isProofLoading ? (
                <div className="p-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-7 h-7 border-2 border-instrument-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-rind-400 text-xs font-medium">Constructing Merkle leaf & sibling path...</span>
                </div>
              ) : merkleProof ? (
                <>
                  <div className="bg-ink-850 p-3 rounded-rad border border-rind-500/15 space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-rind-500">Alert ID:</span>
                      <span className="text-instrument-400 font-bold">{merkleProof.alertId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rind-500">Ledger Sequence:</span>
                      <span className="text-rind-200">#{merkleProof.sequence}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rind-500">Range:</span>
                      <span className="text-rind-200">Seq #{merkleProof.fromSequence} → #{merkleProof.throughSequence}</span>
                    </div>
                    <div>
                      <span className="text-rind-500 block mb-0.5">Leaf Hash (Canonical SHA-256):</span>
                      <div className="bg-ink-950 p-1.5 rounded border border-rind-500/20 text-instrument-400 text-[10.5px] truncate">
                        {merkleProof.leafHash}
                      </div>
                    </div>
                    <div>
                      <span className="text-rind-500 block mb-0.5">Expected Merkle Root:</span>
                      <div className="bg-ink-950 p-1.5 rounded border border-rind-500/20 text-rind-200 text-[10.5px] truncate">
                        {merkleProof.rootHash}
                      </div>
                    </div>
                  </div>

                  {/* Sibling Path */}
                  <div className="bg-ink-850 p-3 rounded-rad border border-rind-500/15 space-y-2">
                    <div className="flex items-center justify-between text-rind-200 font-semibold font-display text-xs">
                      <span>Cryptographic Sibling Path</span>
                      <span className="text-[10px] font-mono text-rind-500">{merkleProof.siblingHashes.length} Siblings</span>
                    </div>
                    {merkleProof.siblingHashes.length === 0 ? (
                      <div className="text-[11px] text-rind-500 italic">Single-leaf tree (leaf equals root).</div>
                    ) : (
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                        {merkleProof.siblingHashes.map((sib, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-ink-950 p-1.5 rounded border border-rind-500/15 text-[10.5px] font-mono">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              merkleProof.positions[idx] === 'left' ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/30' : 'bg-instrument-d text-instrument-400 border border-instrument-400/30'
                            }`}>
                              {merkleProof.positions[idx]}
                            </span>
                            <span className="text-rind-300 truncate flex-1">{sib}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Verification Banner */}
                  {proofVerifyResult && (
                    <div className={`p-3 rounded-rad border flex items-start gap-2.5 ${
                      proofVerifyResult.valid ? 'bg-leaf-900/50 border-leaf-500/30 text-leaf-500' : 'bg-melon-d border-melon-500/40 text-melon-500'
                    }`}>
                      <i className={`ti ${proofVerifyResult.valid ? 'ti-circle-check' : 'ti-alert-octagon'} text-base shrink-0 mt-0.5`}></i>
                      <div>
                        <div className="font-bold">{proofVerifyResult.valid ? 'INCLUSION PROOF MATHEMATICALLY VERIFIED' : 'PROOF VERIFICATION FAILED'}</div>
                        <div className="text-[11px] mt-0.5 opacity-90">{proofVerifyResult.message}</div>
                        <div className="text-[10px] font-mono mt-1 opacity-80">
                          Computed: {proofVerifyResult.calculatedRootHash?.slice(0, 16)}... | Expected: {proofVerifyResult.rootHash?.slice(0, 16)}...
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-rind-500 text-xs">No proof data available.</div>
              )}
            </div>

            <div className="px-4 py-3 bg-ink-850 border-t border-rind-500/15 flex items-center justify-between shrink-0">
              <button
                onClick={handleVerifyMerkleProof}
                disabled={!merkleProof || isProofVerifying}
                className="px-3.5 py-1.5 bg-instrument-400 hover:bg-instrument-300 text-ink-950 font-bold text-xs rounded-rad3 flex items-center gap-1.5 transition-colors"
              >
                <i className={`ti ${isProofVerifying ? 'ti-loader animate-spin' : 'ti-shield-check'}`}></i>
                {isProofVerifying ? 'Verifying Path...' : 'Verify Inclusion Proof'}
              </button>
              <button
                onClick={() => { setProofTargetAlertId(null); setMerkleProof(null); setProofVerifyResult(null); }}
                className="px-3.5 py-1.5 bg-ink-800 text-rind-200 border border-rind-500/20 text-xs rounded-rad3 hover:bg-ink-750"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Provenance Modal (FR-MP-5) */}
      {provTargetAlertId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-border-default rounded-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-default bg-surface-subtle shrink-0">
              <div className="flex items-center gap-2">
                <i className="ti ti-cpu text-[#0b8d8b] text-lg"></i>
                <div>
                  <div className="text-sm font-bold font-display text-txt-primary">AI Model & Rule Provenance</div>
                  <div className="text-[10.5px] text-txt-muted font-mono">Alert ID: {provTargetAlertId}</div>
                </div>
              </div>
              <button
                onClick={() => { setProvTargetAlertId(null); setAlertProvenance(null); setProvVerifyResult(null); }}
                className="text-txt-muted hover:text-txt-primary text-base p-1"
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto max-h-[calc(90vh-120px)] text-xs">
              {isProvLoading ? (
                <div className="p-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-7 h-7 border-2 border-leaf-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-rind-400 text-xs font-medium">Retrieving registered model weights & hashes...</span>
                </div>
              ) : alertProvenance ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      alertProvenance.provenance === 'detector' ? 'bg-leaf-900 text-leaf-500 border-leaf-500/30' : 'bg-ink-800 text-rind-400 border-rind-500/20'
                    }`}>
                      {alertProvenance.provenance.toUpperCase()}
                    </span>
                    {alertProvenance.provenance === 'simulation' && (
                      <span className="text-[11px] text-amber-400">
                        Explicit simulation provenance enforced (synthetic artifact).
                      </span>
                    )}
                  </div>

                  <div className="bg-ink-850 p-3 rounded-rad border border-rind-500/15 space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-rind-500">Model Name:</span>
                      <span className="text-rind-200 font-semibold">{alertProvenance.modelName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rind-500">Model Version:</span>
                      <span className="text-rind-200">{alertProvenance.modelVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rind-500">Runtime Version:</span>
                      <span className="text-rind-200">{alertProvenance.runtimeVersion}</span>
                    </div>
                    <div>
                      <span className="text-rind-500 block mb-0.5">Model Artifact SHA-256:</span>
                      <div className="bg-ink-950 p-1.5 rounded border border-rind-500/20 text-rind-200 text-[10.5px] truncate">
                        {alertProvenance.modelArtifactHash}
                      </div>
                    </div>
                    <div>
                      <span className="text-rind-500 block mb-0.5">Rule Config SHA-256:</span>
                      <div className="bg-ink-950 p-1.5 rounded border border-rind-500/20 text-rind-200 text-[10.5px] truncate">
                        {alertProvenance.ruleConfigHash}
                      </div>
                    </div>
                    <div>
                      <span className="text-rind-500 block mb-0.5">Canonical Provenance Hash:</span>
                      <div className="bg-ink-950 p-1.5 rounded border border-rind-500/20 text-leaf-400 text-[10.5px] truncate font-bold">
                        {alertProvenance.provenanceHash}
                      </div>
                    </div>
                  </div>

                  {provVerifyResult && (
                    <div className={`p-3 rounded-rad border flex items-start gap-2.5 ${
                      provVerifyResult.matches ? 'bg-leaf-900/50 border-leaf-500/30 text-leaf-500' : 'bg-melon-d border-melon-500/40 text-melon-500'
                    }`}>
                      <i className={`ti ${provVerifyResult.matches ? 'ti-circle-check' : 'ti-alert-octagon'} text-base shrink-0 mt-0.5`}></i>
                      <div>
                        <div className="font-bold">{provVerifyResult.matches ? 'PROVENANCE INTEGRITY VERIFIED' : 'PROVENANCE MISMATCH'}</div>
                        <div className="text-[11px] mt-0.5 opacity-90">{provVerifyResult.message}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-rind-500 text-xs">No provenance record found.</div>
              )}
            </div>

            <div className="px-4 py-3 bg-ink-850 border-t border-rind-500/15 flex items-center justify-between shrink-0">
              <button
                onClick={handleVerifyProvenance}
                disabled={!alertProvenance || isProvVerifying}
                className="px-3.5 py-1.5 bg-leaf-600 hover:bg-leaf-500 text-ink-950 font-bold text-xs rounded-rad3 flex items-center gap-1.5 transition-colors"
              >
                <i className={`ti ${isProvVerifying ? 'ti-loader animate-spin' : 'ti-shield-check'}`}></i>
                {isProvVerifying ? 'Verifying Hashes...' : 'Verify Provenance Integrity'}
              </button>
              <button
                onClick={() => { setProvTargetAlertId(null); setAlertProvenance(null); setProvVerifyResult(null); }}
                className="px-3.5 py-1.5 bg-ink-800 text-rind-200 border border-rind-500/20 text-xs rounded-rad3 hover:bg-ink-750"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Multisig Proposal Reason Prompt Modal */}
      {rejectingProposalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-rose-500/30 rounded-2xl w-full max-w-[460px] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-surface-subtle border-b border-border-default flex items-center justify-between">
              <div className="text-xs font-bold text-rose-600 flex items-center gap-1.5 font-display">
                <i className="ti ti-shield-x"></i>
                Reject Multisig Proposal
              </div>
              <button onClick={() => setRejectingProposalId(null)} className="text-txt-muted hover:text-txt-primary text-xs">
                <i className="ti ti-x"></i>
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="text-rind-300">
                Rejecting proposal <span className="font-mono font-bold text-rind-100">{rejectingProposalId}</span> will prevent it from reaching consensus. Please provide a forensic reason:
              </div>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Ledger sequence range overlaps with unreviewed forensic incident..."
                rows={3}
                className="w-full bg-ink-950 border border-rind-500/20 rounded p-2 text-rind-100 text-xs focus:outline-none focus:border-melon-500"
              />
            </div>
            <div className="px-4 py-3 bg-ink-850 border-t border-rind-500/15 flex justify-end gap-2">
              <button
                onClick={() => setRejectingProposalId(null)}
                className="px-3 py-1.5 bg-ink-800 text-rind-300 text-xs rounded-rad3 hover:bg-ink-750"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectProposal}
                disabled={!rejectionReason.trim()}
                className="px-3.5 py-1.5 bg-melon-d text-melon-500 border border-melon-500/30 hover:bg-melon-500/20 text-xs font-bold rounded-rad3 transition-colors disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
