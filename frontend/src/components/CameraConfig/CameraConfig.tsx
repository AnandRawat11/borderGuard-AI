import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ConfirmModal } from '../Modals/ConfirmModal';
import { isWebcamCapable } from '../../utils/camera';

export const CameraConfig: React.FC = () => {
  const { cams, toggleCamOnline, currentUser, showNotice, isCamWebcamActive, goToPage, addCamera, removeCamera } = useApp();
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCamName, setNewCamName] = useState('');
  const [newRtspUrl, setNewRtspUrl] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<'High' | 'Medium' | 'Low'>('High');

  const isAdmin = currentUser?.role === 'admin';

  const handleToggleClick = (camId: string, isOnline: boolean) => {
    if (!isAdmin) {
      showNotice('error', 'Administrator permission required to modify camera configuration.');
      return;
    }
    if (isOnline) {
      setConfirmTarget(camId);
    } else {
      toggleCamOnline(camId);
    }
  };

  const handleConfirmDisable = () => {
    if (confirmTarget) {
      toggleCamOnline(confirmTarget);
      setConfirmTarget(null);
    }
  };

  const handleSaveCamera = async () => {
    if (!newRtspUrl.trim()) {
      showNotice('error', 'RTSP stream address is required.');
      return;
    }
    const name = newCamName.trim() || `CAM-0${cams.length + 1} · RTSP Stream`;
    try {
      await addCamera({
        name,
        rtspUrl: newRtspUrl.trim(),
        location: newLocation.trim() || 'Perimeter Sector — RTSP Ingest',
        priority: newPriority,
        online: true
      });
      setIsAddModalOpen(false);
      setNewCamName('');
      setNewRtspUrl('');
      setNewLocation('');
      setNewPriority('High');
    } catch {
      // Notice handled in addCamera
    }
  };

  const handleDeleteCamera = async (camId: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name}?`)) {
      await removeCamera(camId);
    }
  };

  const targetCam = cams.find(c => c.id === confirmTarget);
  const onlineCount = cams.filter(c => c.online).length;
  const offlineCount = cams.length - onlineCount;
  const highPriorityCount = cams.filter(c => c.priority === 'High').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-canvas text-txt-primary">
      
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <div>
        <div className="text-[11px] text-[#708197] dark:text-slate-400 mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-[#8165ca] font-bold">Sensor Topology &amp; Calibration</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
              Sensor Topology &amp; Node Calibration
            </h1>
            <p className="text-xs md:text-[13px] text-txt-muted mt-1 m-0">
              Registered edge nodes, network RTSP endpoints, and sensor operational states.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#0b8d8b] to-[#14b8a6] hover:from-[#097775] hover:to-[#0d9488] shadow-sm hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>＋</span>
              <span>Add RTSP Node</span>
            </button>
            <button
              onClick={() => goToPage('camgrid')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border border-border-default text-xs font-bold text-txt-primary hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs"
            >
              <span>▣</span>
              <span>Open Video Wall</span>
            </button>
            <button
              onClick={() => goToPage('models')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] shadow-[0_6px_14px_rgba(11,141,139,0.25)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>⚙</span>
              <span>Inference Pipeline</span>
            </button>
            <button
              onClick={() => goToPage('features')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border border-border-default text-xs font-bold text-txt-primary hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs"
            >
              <span>◈</span>
              <span>Feature controls</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4 CURATED DISTINCTLY COLOURED METRIC CARDS
          1. Teal (Connected Sensors)
          2. Red (Offline / Maintenance)
          3. Orange (High Priority Sectors)
          4. Blue (Topology / Protocol)
          ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="Camera Topology Metrics">
        
        {/* CARD 1: TEAL - CONNECTED SENSORS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#0b8d8b]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#0b8d8b]/10 dark:bg-[#0b8d8b]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Connected sensors</span>
            <div className="w-8 h-8 rounded-lg bg-[#e6f7f5] dark:bg-teal-950/40 text-[#0b8d8b] dark:text-cyan-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ◉
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#0b8d8b] dark:text-cyan-300 mt-2 relative z-1 tabular-nums">
            {String(onlineCount).padStart(2, '0')}/{String(cams.length).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Active streaming nodes
          </small>
        </div>

        {/* CARD 2: RED - OFFLINE SENSORS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#c84f58]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#c84f58]/10 dark:bg-[#c84f58]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Offline / Maintenance</span>
            <div className="w-8 h-8 rounded-lg bg-[#fff0f1] dark:bg-rose-950/40 text-[#c84f58] dark:text-rose-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ⚑
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#c84f58] dark:text-rose-300 mt-2 relative z-1 tabular-nums">
            {String(offlineCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            {offlineCount > 0 ? 'Requires sentry inspection' : 'Zero sensor faults'}
          </small>
        </div>

        {/* CARD 3: ORANGE - HIGH PRIORITY SECTORS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#c77a21]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#c77a21]/10 dark:bg-[#c77a21]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">High priority sectors</span>
            <div className="w-8 h-8 rounded-lg bg-[#fff4e4] dark:bg-amber-950/40 text-[#c77a21] dark:text-amber-300 flex items-center justify-center font-bold text-sm shadow-xs">
              !
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#c77a21] dark:text-amber-300 mt-2 relative z-1 tabular-nums">
            {String(highPriorityCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Primary fence perimeter
          </small>
        </div>

        {/* CARD 4: BLUE - PROTOCOL / TOPOLOGY */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#5277d7]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#5277d7]/10 dark:bg-[#5277d7]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Ingest protocol</span>
            <div className="w-8 h-8 rounded-lg bg-[#edf2ff] dark:bg-blue-950/40 text-[#5277d7] dark:text-blue-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ▣
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#5277d7] dark:text-blue-300 mt-2 relative z-1 tabular-nums">
            RTSP/HLS
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            H.264 / WebRTC edge transport
          </small>
        </div>

      </section>

      {/* =========================================================================
          CAMERA DIRECTORY LIST
          ========================================================================= */}
      <section className="bg-surface border border-border-default rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-bold text-txt-primary m-0 flex items-center gap-2">
              <span className="w-1.5 h-3.5 rounded-full bg-gradient-to-b from-[#8165ca] to-[#0b8d8b]" />
              Configured Camera Directory
            </h2>
            <p className="text-[11px] text-txt-muted m-0 mt-0.5">Toggle live feed transmission or re-route streaming parameters</p>
          </div>
          <span className="text-xs font-bold text-[#8165ca]">
            {cams.length} Total Nodes Registered
          </span>
        </div>

        {cams.length === 0 ? (
          <div className="p-12 text-center">
            <i className="ti ti-video-off text-4xl text-txt-muted opacity-50" />
            <div className="text-xs font-bold text-txt-primary mt-2">No cameras configured</div>
            <div className="text-[11px] text-txt-muted mt-0.5">Please add or discover edge camera endpoints.</div>
          </div>
        ) : (
          <div className="divide-y divide-[#eff2f5] dark:divide-slate-800">
            {cams.map(c => (
              <div key={c.id} className="flex items-center gap-4 py-4 first:pt-1 last:pb-1 flex-wrap sm:flex-nowrap">
                {/* Status Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-xs ${
                  c.online ? 'bg-[#e6f7f5] dark:bg-teal-950/40 text-[#0b8d8b]' : 'bg-[#fff0f1] dark:bg-rose-950/40 text-[#c84f58]'
                }`}>
                  <i className={`ti ${c.online ? 'ti-video' : 'ti-video-off'}`} />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <strong className="text-xs md:text-sm text-txt-primary font-bold">{c.name}</strong>
                    {isWebcamCapable(c) && (
                      <span className="text-[9px] font-mono text-[#5277d7] bg-[#edf2ff] dark:bg-blue-950/40 px-2 py-0.5 rounded-full font-bold">
                        Webcam Node
                      </span>
                    )}
                    {isCamWebcamActive(c.id) && (
                      <span className="text-[9px] font-mono text-[#0b8d8b] bg-[#e6f7f5] dark:bg-teal-950/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                        Active Camera Stream
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-txt-muted bg-surface-subtle border border-border-default px-2 py-0.5 rounded-full">
                      {c.activeModelVersion ? `v${c.activeModelVersion}` : 'Model: YOLOv8n'}
                    </span>
                  </div>
                  <div className="text-[11px] text-txt-muted font-mono truncate">
                    {c.rtspUrl ? c.rtspUrl.replace(/:554.*/, ':554/****') : 'rtsp://192.168.1.101:554/live'} &nbsp;·&nbsp; {c.location}
                  </div>
                </div>

                {/* Priority */}
                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${
                  c.priority === 'High' ? 'bg-[#fff0f1] text-[#c84f58]' : 'bg-[#fff4e4] text-[#c77a21]'
                }`}>
                  {c.priority} priority
                </span>

                {/* Status */}
                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${
                  c.online ? 'bg-[#eaf7ef] text-[#25855c]' : 'bg-slate-100 text-slate-500'
                }`}>
                  {c.online ? 'Connected' : 'Disconnected'}
                </span>

                {/* Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.online}
                  aria-label={`Toggle power state for ${c.name}`}
                  onClick={() => handleToggleClick(c.id, c.online)}
                  className={`w-11 h-6 rounded-full cursor-pointer relative transition-colors duration-200 shrink-0 outline-none p-0.5 ${
                    c.online ? 'bg-[#0b8d8b]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                    c.online ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>

                {/* Delete Camera (for non-primary cameras) */}
                {c.id !== 'cam-1' && (
                  <button
                    onClick={() => handleDeleteCamera(c.id, c.name)}
                    title="Remove camera node"
                    className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(confirmTarget)}
        title="Disable Sector Camera Feed?"
        message={`Are you sure you want to disconnect ${targetCam?.name || 'this camera'}? Live AI perimeter surveillance and automated tripwire triggers will be suspended for this sector.`}
        confirmLabel="Disconnect Camera"
        cancelLabel="Keep Online"
        isDestructive={true}
        onConfirm={handleConfirmDisable}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Register RTSP Camera Modal */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.target === e.currentTarget && setIsAddModalOpen(false)}
          className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-surface border border-border-default rounded-[20px] max-w-[480px] w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-txt-primary">Register Edge RTSP Camera Node</h3>
                <p className="text-xs text-txt-muted mt-0.5">Connect network RTSP/H.264 camera to OpenCV ingestion pipeline.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg text-txt-muted hover:text-txt-primary flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">Camera Name</label>
                <input
                  type="text"
                  value={newCamName}
                  onChange={e => setNewCamName(e.target.value)}
                  placeholder="E.g. CAM-03 · West Gate RTSP"
                  className="w-full h-9 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">RTSP Stream Address</label>
                <input
                  type="text"
                  value={newRtspUrl}
                  onChange={e => setNewRtspUrl(e.target.value)}
                  placeholder="rtsp://192.168.1.120:554/stream1"
                  className="w-full h-9 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none font-mono"
                />
                <span className="text-[11px] text-txt-muted mt-1 block">
                  Accepts standard RTSP endpoints (e.g. rtsp://user:pass@192.168.1.50:554/live). Ingested via TCP.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1">Sector / Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="Perimeter Sector Bravo"
                    className="w-full h-9 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={e => setNewPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                    className="w-full h-9 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 py-2 rounded-xl border border-border-default text-xs font-bold text-txt-secondary hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCamera}
                className="flex-1 py-2 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#0b8d8b] to-[#14b8a6] hover:brightness-110 shadow-sm cursor-pointer"
              >
                Register &amp; Connect
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
