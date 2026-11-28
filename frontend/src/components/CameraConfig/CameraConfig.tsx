import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ConfirmModal } from '../Modals/ConfirmModal';
import { isWebcamCapable } from '../../utils/camera';
import { SpatialOverlay } from '../Spatial/MotionPrimitives';

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
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-transparent text-txt-primary">
      {/* Header */}
      <div>
        <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-primary font-bold">Sensor Topology &amp; Calibration</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            Sensor Topology &amp; Node Calibration
          </h1>

          <div className="flex flex-wrap items-center gap-2 min-w-0 xl:shrink-0">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-white font-bold text-xs brand-button hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-plus" aria-hidden="true" />
              <span>Add RTSP Node</span>
            </button>
            <button
              onClick={() => goToPage('camgrid')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] spatial-glass text-xs font-bold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all"
            >
              <i className="ti ti-layout-grid" aria-hidden="true" />
              <span>Open Video Wall</span>
            </button>
            <button
              onClick={() => goToPage('models')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] spatial-glass text-xs font-bold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-cpu" aria-hidden="true" />
              <span>Inference Pipeline</span>
            </button>
            <button
              onClick={() => goToPage('features')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] spatial-glass text-xs font-bold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all"
            >
              <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
              <span>Feature controls</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Spatial Glass Statistics Strip */}
      <section className="spatial-stats-strip shrink-0" aria-label="Camera Topology Metrics">
        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Connected sensors</span>
            <i className="ti ti-device-cctv text-base text-primary" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-primary mt-1.5 tabular-nums">
            {String(onlineCount).padStart(2, '0')}/{String(cams.length).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Offline / Maintenance</span>
            <i className="ti ti-video-off text-base text-status-danger" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-status-danger mt-1.5 tabular-nums">
            {String(offlineCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-txt-muted block mt-0.5">
            {offlineCount > 0 ? 'Requires inspection' : 'Zero faults'}
          </small>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>High priority sectors</span>
            <i className="ti ti-alert-triangle text-base text-status-warning" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-status-warning mt-1.5 tabular-nums">
            {String(highPriorityCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Ingest protocol</span>
            <i className="ti ti-network text-base text-info" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-info mt-1.5 tabular-nums">
            RTSP/HLS
          </b>
        </div>
      </section>

      {/* Camera Directory List */}
      <section className="spatial-glass overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle">
          <h2 className="text-sm font-bold font-display text-txt-primary m-0">
            Configured Camera Directory
          </h2>
          <span className="text-xs font-semibold font-mono text-txt-muted">
            {cams.length} Total Nodes
          </span>
        </div>

        {cams.length === 0 ? (
          <div className="p-8 text-center">
            <i className="ti ti-video-off text-3xl text-txt-muted opacity-50" />
            <div className="text-xs font-bold text-txt-primary mt-2">No cameras configured</div>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle bg-surface/45">
            {cams.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 flex-wrap sm:flex-nowrap hover:bg-primary-surface/35 transition-colors">
                <i
                  className={`ti ${c.online ? 'ti-video text-primary' : 'ti-video-off text-status-danger'} text-xl shrink-0`}
                  aria-hidden="true"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <strong className="text-xs md:text-sm text-txt-primary font-bold">{c.name}</strong>
                    {isWebcamCapable(c) && (
                      <span className="text-[9px] font-mono text-info bg-info-surface px-2 py-0.5 rounded-full font-bold">
                        Webcam Node
                      </span>
                    )}
                    {isCamWebcamActive(c.id) && (
                      <span className="text-[9px] font-mono text-primary bg-primary-surface px-2 py-0.5 rounded-full font-bold">
                        Active Camera Stream
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-txt-muted bg-surface/75 border border-border-subtle px-2 py-0.5 rounded-full">
                      {c.activeModelVersion ? `v${c.activeModelVersion}` : 'Model: YOLOv8n'}
                    </span>
                  </div>
                  <div className="text-[11px] text-txt-muted font-mono truncate">
                    {c.rtspUrl ? c.rtspUrl.replace(/:554.*/, ':554/****') : 'rtsp://192.168.1.101:554/live'} &nbsp;·&nbsp; {c.location}
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${
                  c.priority === 'High' ? 'bg-status-danger-surface text-status-danger' : 'bg-status-warning-surface text-status-warning'
                }`}>
                  {c.priority} priority
                </span>

                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${
                  c.online ? 'bg-status-success-surface text-status-success' : 'bg-surface border border-border-subtle text-txt-muted'
                }`}>
                  {c.online ? 'Connected' : 'Disconnected'}
                </span>

                <button
                  type="button"
                  role="switch"
                  aria-checked={c.online}
                  aria-label={`Toggle power state for ${c.name}`}
                  onClick={() => handleToggleClick(c.id, c.online)}
                  className={`w-11 h-6 rounded-full cursor-pointer relative transition-colors duration-200 shrink-0 outline-none p-0.5 ${
                    c.online ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                    c.online ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>

                {c.id !== 'cam-1' && (
                  <button
                    onClick={() => handleDeleteCamera(c.id, c.name)}
                    title="Remove camera node"
                    className="p-1.5 rounded-lg text-txt-muted hover:text-status-danger hover:bg-status-danger-surface/60 transition-colors cursor-pointer"
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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

      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.target === e.currentTarget && setIsAddModalOpen(false)}
          className="fixed inset-0 z-[200] bg-slate-950/30 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        >
          <SpatialOverlay className="ui-dialog spatial-glass-overlay max-w-[480px] w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h3 className="text-base font-bold font-display text-txt-primary">Register Edge RTSP Camera Node</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close add camera dialog"
                className="w-8 h-8 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-primary-surface/60 flex items-center justify-center"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">Camera Name</label>
                <input
                  type="text"
                  value={newCamName}
                  onChange={e => setNewCamName(e.target.value)}
                  placeholder="E.g. CAM-03 · West Gate RTSP"
                  className="w-full h-9 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-primary mb-1">RTSP Stream Address</label>
                <input
                  type="text"
                  value={newRtspUrl}
                  onChange={e => setNewRtspUrl(e.target.value)}
                  placeholder="rtsp://192.168.1.120:554/stream1"
                  className="w-full h-9 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1">Sector / Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="Perimeter Sector Bravo"
                    className="w-full h-9 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={e => setNewPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                    className="w-full h-9 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-border-subtle">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 py-2 rounded-[10px] border border-border-default bg-surface/75 text-xs font-bold text-txt-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCamera}
                className="flex-1 py-2 rounded-[10px] text-white font-bold text-xs brand-button cursor-pointer"
              >
                Register &amp; Connect
              </button>
            </div>
          </SpatialOverlay>
        </div>
      )}
    </div>
  );
};
