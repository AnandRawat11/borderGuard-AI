import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { getSceneSvg } from '../../services/mockScenes';
import { Camera, DetectionBox } from '../../types';
import { SpatialOverlay, SPATIAL_SPRING } from '../Spatial/MotionPrimitives';

interface CustomFeed {
  id: string;
  type: 'cam' | 'rtsp' | 'file' | 'demo';
  name: string;
  url?: string;
  file?: File;
  streamObject?: MediaStream;
  isSimulated?: boolean;
}

interface HardwareCameraCardProps {
  c: Camera;
  isWebcam: boolean;
  fpsVal: number;
  webcamStream: MediaStream | null;
  isHardwareWebcam: boolean;
  startWebcam: () => void;
  streamUrl: string;
  onSnapshot: (name: string, element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null) => void;
  onFullscreen: (id: string) => void;
  liveDetections?: DetectionBox[];
}

const HardwareCameraCard: React.FC<HardwareCameraCardProps> = ({
  c,
  isWebcam,
  fpsVal,
  webcamStream,
  isHardwareWebcam,
  startWebcam,
  streamUrl,
  onSnapshot,
  onFullscreen,
  liveDetections,
}) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div
      className="group relative aspect-video rounded-xl overflow-hidden bg-[#050d17] border border-border-strong hover:border-primary hover:shadow-elevated transition-all"
    >
      {/* OSD TOP */}
      <div className="absolute top-0 left-0 right-0 z-10 p-2.5 bg-gradient-to-b from-[#050d17]/85 to-transparent flex items-center justify-between text-white font-mono text-[10.5px] pointer-events-none drop-shadow">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
            c.online ? 'bg-emerald-500/80 text-white animate-pulse' : 'bg-rose-500/80 text-white'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            {c.online ? (isWebcam ? 'AI LIVE' : 'LIVE') : 'OFFLINE'}
          </span>
          <span className="font-bold">{c.name}</span>
        </div>
        <time className="tabular-nums text-slate-300">
          {new Date().toLocaleTimeString('en-GB')}
        </time>
      </div>

      {/* VIDEO / STREAM VIEW */}
      {c.online ? (
        isWebcam ? (
          <>
            <video
              ref={el => {
                videoRef.current = el;
                if (el && webcamStream && el.srcObject !== webcamStream) {
                  el.srcObject = webcamStream;
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              onLoadedMetadata={e => {
                (e.target as HTMLVideoElement).play().catch(() => {});
              }}
            />
            {/* Real-time Bounding Boxes Layer */}
            {liveDetections && liveDetections.map((b, i) => (
              <div
                key={i}
                className={`dbox ${b.class === 'watchlist' ? 'watchlist' : (b.friendly ? 'friendly' : (b.watch ? 'threat' : ''))}`}
                style={{
                  left: `${b.left}%`,
                  top: `${b.top}%`,
                  width: `${b.w}%`,
                  height: `${b.h}%`,
                  zIndex: 3
                }}
              >
                <div className="dbox-tag">{b.label}</div>
              </div>
            ))}
            {/* Watchlist Person Found Banner */}
            {liveDetections && liveDetections.some(b => b.class === 'watchlist') && (
              <div className="absolute top-9 left-2 z-10 px-2 py-0.5 rounded bg-cyan-950/90 border border-cyan-400 text-cyan-200 text-[10px] font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.5)] animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>WATCHLIST PERSON FOUND</span>
              </div>
            )}
            {!isHardwareWebcam && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 p-3 text-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startWebcam();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-transform active:scale-95 cursor-pointer"
                >
                  <i className="ti ti-camera" />
                  <span>Connect Laptop Camera</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <img
              ref={imgRef}
              src={streamUrl}
              alt={c.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={e => {
                (e.currentTarget as HTMLElement).style.display = 'none';
                const fb = document.getElementById(`grid-svg-${c.id}`);
                if (fb) fb.style.display = 'block';
              }}
            />
            {/* Real-time Bounding Boxes Layer */}
            {liveDetections && liveDetections.map((b, i) => (
              <div
                key={i}
                className={`dbox ${b.class === 'watchlist' ? 'watchlist' : (b.friendly ? 'friendly' : (b.watch ? 'threat' : ''))}`}
                style={{
                  left: `${b.left}%`,
                  top: `${b.top}%`,
                  width: `${b.w}%`,
                  height: `${b.h}%`,
                  zIndex: 3
                }}
              >
                <div className="dbox-tag">{b.label}</div>
              </div>
            ))}
            {/* Watchlist Person Found Banner */}
            {liveDetections && liveDetections.some(b => b.class === 'watchlist') && (
              <div className="absolute top-9 left-2 z-10 px-2 py-0.5 rounded bg-cyan-950/90 border border-cyan-400 text-cyan-200 text-[10px] font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.5)] animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>WATCHLIST PERSON FOUND</span>
              </div>
            )}
            <div
              id={`grid-svg-${c.id}`}
              className="absolute inset-0 w-full h-full hidden"
              dangerouslySetInnerHTML={{ __html: getSceneSvg(c.scene) }}
            />
          </>
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a1724]">
          <span className="w-9 h-9 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold text-lg">
            <i className="ti ti-x" aria-hidden="true" />
          </span>
          <span className="text-xs font-bold text-rose-400">Signal Offline</span>
        </div>
      )}

      {/* OSD BOTTOM */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-2 bg-gradient-to-t from-[#050d17]/85 to-transparent flex items-center justify-between text-slate-300 font-mono text-[9.5px] pointer-events-none">
        <span>{c.location}</span>
        <span className="tabular-nums text-emerald-400 font-bold">{fpsVal} FPS · 1280×720</span>
      </div>

      {/* HOVER ACTION TOOLBAR */}
      <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => onSnapshot(c.name, isWebcam ? videoRef.current : imgRef.current)}
          title="Forensic Snapshot"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-[#2e18dc] text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          <i className="ti ti-camera" aria-hidden="true" />
        </button>
        <button
          onClick={() => onFullscreen(c.id)}
          title="Inspect & Enlarge"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-[#2e18dc] text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          <i className="ti ti-maximize" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

interface CustomFeedCardProps {
  feed: CustomFeed;
  fallbackStreamUrl: string;
  onSnapshot: (name: string, element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null) => void;
  onRemove: (feedId: string) => void;
  onCanvasRef: (canvas: HTMLCanvasElement | null) => void;
}

const CustomFeedCard: React.FC<CustomFeedCardProps> = ({
  feed,
  fallbackStreamUrl,
  onSnapshot,
  onRemove,
  onCanvasRef,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  return (
    <div
      className="group relative aspect-video rounded-xl overflow-hidden bg-[#050d17] border border-border-strong hover:border-primary hover:shadow-elevated transition-all"
    >
      {/* OSD TOP */}
      <div className="absolute top-0 left-0 right-0 z-10 p-2.5 bg-gradient-to-b from-[#050d17]/85 to-transparent flex items-center justify-between text-white font-mono text-[10.5px] pointer-events-none drop-shadow">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
            feed.type === 'demo'
              ? 'bg-amber-500/80 text-white'
              : feed.type === 'file'
              ? 'bg-blue-500/80 text-white'
              : 'bg-emerald-500/80 text-white animate-pulse'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            {feed.type.toUpperCase()}
          </span>
          <span className="font-bold truncate max-w-[140px]">{feed.name}</span>
        </div>
        <time className="tabular-nums text-slate-300">
          {new Date().toLocaleTimeString('en-GB')}
        </time>
      </div>

      {/* FEED CONTENT */}
      {feed.type === 'demo' ? (
        <canvas
          ref={el => {
            canvasRef.current = el;
            onCanvasRef(el);
          }}
          width={640}
          height={360}
          className="absolute inset-0 w-full h-full object-cover block"
        />
      ) : feed.type === 'cam' ? (
        <video
          ref={el => {
            videoRef.current = el;
            if (el && feed.streamObject) el.srcObject = feed.streamObject;
          }}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : feed.type === 'rtsp' ? (
        <div className="absolute inset-0 bg-[#06121e] flex items-center justify-center overflow-hidden">
          <img
            ref={imgRef}
            src={feed.url && feed.url.startsWith('http') ? feed.url : fallbackStreamUrl}
            alt={feed.name}
            className="w-full h-full object-cover"
            onError={e => {
              (e.currentTarget as HTMLElement).style.display = 'none';
              const fb = (e.currentTarget.parentElement as HTMLElement)?.querySelector('.rtsp-fallback');
              if (fb) (fb as HTMLElement).style.display = 'flex';
            }}
          />
          <div className="rtsp-fallback absolute inset-0 hidden flex-col items-center justify-center p-4 text-center bg-[#071322]">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center text-lg mb-2">
              <i className="ti ti-player-play" aria-hidden="true" />
            </div>
            <b className="text-xs font-bold text-white font-mono">{feed.name}</b>
            <small className="text-[11px] text-slate-400 font-mono mt-1 max-w-[240px] truncate">{feed.url}</small>
            <span className="mt-2 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              RTSP Link Registered
            </span>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={feed.url}
          autoPlay
          playsInline
          loop
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* OSD BOTTOM */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-2 bg-gradient-to-t from-[#050d17]/85 to-transparent flex items-center justify-between text-slate-300 font-mono text-[9.5px] pointer-events-none">
        <span>{feed.type === 'file' ? 'LOCAL MP4 STREAM' : 'ACTIVE INGEST'}</span>
        <span className="tabular-nums text-cyan-300">640×360</span>
      </div>

      {/* HOVER TOOLBAR */}
      <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => {
            const targetEl = feed.type === 'demo' ? canvasRef.current : feed.type === 'rtsp' ? imgRef.current : videoRef.current;
            onSnapshot(feed.name, targetEl);
          }}
          title="Forensic Snapshot"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-[#2e18dc] text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          <i className="ti ti-camera" aria-hidden="true" />
        </button>
        <button
          onClick={() => onRemove(feed.id)}
          title="Remove Feed"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-rose-600 text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};


export const CameraGrid: React.FC = () => {
  const { cams, activeCamId, alerts, webcamStream, webcamFps, isCamWebcamActive, isHardwareWebcam, startWebcam, openFullscreen, metrics, showNotice, streamUrls, liveDetections, addCamera } = useApp();

  const [layout, setLayout] = useState<'2:4' | '3:6' | '3:9' | '4:12'>('2:4');
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'cam' | 'rtsp' | 'file' | 'demo'>('cam');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // RTSP inputs
  const [rtspName, setRtspName] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const simCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  const [cols, maxCapacity] = layout.split(':').map(Number);

  // Discover connected video input devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setAvailableDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      }).catch(err => console.warn('Could not enumerate camera devices:', err));
    }
  }, []);

  // Compute feed counts
  const totalActiveOnWall = cams.length + customFeeds.length;
  const connectedCamsCount = cams.filter(c => c.online).length;
  const rtspStreamsCount = cams.filter(c => c.sourceType === 'rtsp' || !!c.rtspUrl).length + customFeeds.filter(f => f.type === 'rtsp').length;
  const simulatedOrFilesCount = customFeeds.filter(f => f.type === 'file' || f.type === 'demo').length;

  // Add webcam feed
  const handleAddCamera = async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showNotice('error', 'Camera access requires https:// or localhost environment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 } },
        audio: false
      });
      const track = stream.getVideoTracks()[0];
      const newFeed: CustomFeed = {
        id: `webcam-${Date.now()}`,
        type: 'cam',
        name: track.label || `Live Hardware Camera #${customFeeds.length + 1}`,
        streamObject: stream
      };
      setCustomFeeds(prev => [...prev, newFeed]);
      setIsAddModalOpen(false);
      showNotice('success', `Added camera: ${newFeed.name}`);
    } catch (e: any) {
      showNotice('error', `Camera access error: ${e.message}`);
    }
  };

  // Add RTSP feed (registers with backend ingestion worker for live video streaming)
  const handleAddRtsp = async () => {
    const rawUrl = rtspUrl.trim();
    if (!rawUrl) {
      showNotice('error', 'Please enter your RTSP stream address.');
      return;
    }
    const camName = rtspName.trim() || `RTSP Stream #${cams.length + customFeeds.length + 1}`;
    try {
      const newCam = await addCamera({
        name: camName,
        rtspUrl: rawUrl,
        location: 'Network Perimeter Ingest',
        priority: 'High',
        online: true
      });
      setIsAddModalOpen(false);
      setRtspName('');
      setRtspUrl('');
      showNotice('success', `RTSP Camera registered & activated: ${newCam.name}`);
    } catch {
      // If backend registration fails or demo offline, add to custom feeds
      const newFeed: CustomFeed = {
        id: `rtsp-${Date.now()}`,
        type: 'rtsp',
        name: camName,
        url: rawUrl
      };
      setCustomFeeds(prev => [...prev, newFeed]);
      setIsAddModalOpen(false);
      setRtspName('');
      setRtspUrl('');
      showNotice('success', `Added RTSP stream: ${newFeed.name}`);
    }
  };

  // Add local video file
  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: CustomFeed[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('video/')) {
        newItems.push({
          id: `file-${Date.now()}-${i}`,
          type: 'file',
          name: f.name,
          url: URL.createObjectURL(f),
          file: f
        });
      }
    }
    if (newItems.length > 0) {
      setCustomFeeds(prev => [...prev, ...newItems]);
      setIsAddModalOpen(false);
      showNotice('success', `Added ${newItems.length} video file(s) to grid.`);
    } else {
      showNotice('error', 'Please select valid video files (MP4, WebM, MOV).');
    }
  };

  // Snapshot download
  const handleSnapshot = (feedName: string, element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null) => {
    if (!element) {
      showNotice('error', 'Feed not ready for snapshot.');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      const w = (element as any).videoWidth || (element as any).naturalWidth || (element as any).width || 640;
      const h = (element as any).videoHeight || (element as any).naturalHeight || (element as any).height || 360;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(element, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (blob) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `IBVAP-${feedName.replace(/\s+/g, '_')}-${Date.now()}.png`;
            link.click();
            URL.revokeObjectURL(link.href);
            showNotice('success', `Forensic snapshot saved for ${feedName}.`);
          }
        }, 'image/png');
      }
    } catch {
      showNotice('error', 'Snapshot blocked due to cross-origin stream restrictions.');
    }
  };

  const handleRemoveCustomFeed = (feedId: string) => {
    const feed = customFeeds.find(f => f.id === feedId);
    if (feed?.streamObject) {
      feed.streamObject.getTracks().forEach(t => t.stop());
    }
    if (feed?.url && feed.type === 'file') {
      URL.revokeObjectURL(feed.url);
    }
    setCustomFeeds(prev => prev.filter(f => f.id !== feedId));
    showNotice('success', 'Feed removed from wall.');
  };

  const handleStopAll = () => {
    customFeeds.forEach(f => {
      if (f.streamObject) f.streamObject.getTracks().forEach(t => t.stop());
      if (f.url && f.type === 'file') URL.revokeObjectURL(f.url);
    });
    setCustomFeeds([]);
    showNotice('success', 'All custom streams halted.');
  };

  const handleFullscreenWall = () => {
    if (wallRef.current) {
      if (!document.fullscreenElement) {
        wallRef.current.requestFullscreen().catch(() => showNotice('error', 'Fullscreen not supported.'));
      } else {
        document.exitFullscreen();
      }
    }
  };

  const emptySlotsCount = Math.max(0, maxCapacity - totalActiveOnWall);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-transparent">
      {/* Header */}
      <div>
        <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-primary font-bold">Live Monitor &amp; Camera Wall</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            Tactical Video Wall Matrix
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleFullscreenWall}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] spatial-glass text-xs font-bold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all"
            >
              <i className="ti ti-maximize" aria-hidden="true" />
              <span>Full screen</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-white font-bold text-xs brand-button hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-plus" aria-hidden="true" />
              <span>Add feed</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Spatial Glass Statistics Strip */}
      <section className="spatial-stats-strip shrink-0" aria-label="Live Video Wall Metrics">
        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Active feeds</span>
            <i className="ti ti-video text-base text-primary" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-primary mt-1.5 tabular-nums">
            {String(totalActiveOnWall).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Cameras online</span>
            <i className="ti ti-device-cctv text-base text-info" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-info mt-1.5 tabular-nums">
            {String(connectedCamsCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>RTSP streams</span>
            <i className="ti ti-network text-base text-accent" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-accent mt-1.5 tabular-nums">
            {String(rtspStreamsCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Forensic files</span>
            <i className="ti ti-movie text-base text-status-warning" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-status-warning mt-1.5 tabular-nums">
            {String(simulatedOrFilesCount).padStart(2, '0')}
          </b>
        </div>
      </section>

      {/* Wall Controls Bar */}
      <div className="spatial-glass flex items-center justify-between gap-3 flex-wrap p-2 px-3">
        {/* Layout Matrix Selector with Spring Indicator */}
        <div className="flex items-center bg-surface/65 border border-border-subtle p-1 rounded-[10px] gap-1">
          {([
            { id: '2:4', label: '2×2' },
            { id: '3:6', label: '3×2' },
            { id: '3:9', label: '3×3' },
            { id: '4:12', label: '4×3' },
          ] as const).map(opt => {
            const active = layout === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setLayout(opt.id)}
                className={`relative px-3 py-1.5 rounded-[8px] text-xs font-bold transition-colors cursor-pointer ${
                  active ? 'text-primary-text' : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="camgrid-layout-tab"
                    transition={SPATIAL_SPRING}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[8px] brand-button pointer-events-none"
                  />
                )}
                <span className="relative z-[1]">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {customFeeds.length > 0 && (
            <button
              onClick={handleStopAll}
              className="px-3 py-1.5 rounded-[10px] border border-border-default bg-surface/75 text-xs font-bold text-status-danger hover:bg-status-danger-surface transition-colors"
            >
              <i className="ti ti-player-stop" aria-hidden="true" /> Stop all custom
            </button>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 brand-button text-white text-xs font-bold rounded-[10px] transition-all flex items-center gap-1.5"
          >
            <i className="ti ti-plus" aria-hidden="true" />
            <span>Add Feed</span>
          </button>
        </div>
      </div>

      {/* Video Wall Frame (Level 3 glass frame holding unblurred Level 5 feeds) */}
      <div
        ref={wallRef}
        className="spatial-glass rounded-[12px] p-3 md:p-4"
      >
        <div
          className="grid gap-3 transition-all"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
          }}
        >
          {/* 1. SECTOR HARDWARE CAMERAS */}
          {cams.map(c => {
            const isWebcam = isCamWebcamActive(c.id);
            const fpsVal = isWebcam ? (webcamFps || 0) : !c.online ? 0 : (metrics?.cameraTelemetry?.[c.id]?.fps ?? c.fps);

            return (
              <HardwareCameraCard
                key={c.id}
                c={c}
                isWebcam={isWebcam}
                fpsVal={fpsVal}
                webcamStream={webcamStream}
                isHardwareWebcam={isHardwareWebcam}
                startWebcam={startWebcam}
                streamUrl={streamUrls[c.id] || api.getStreamUrl(c.id)}
                onSnapshot={handleSnapshot}
                onFullscreen={openFullscreen}
                liveDetections={c.id === activeCamId || isWebcam ? liveDetections : []}
              />
            );
          })}

          {/* 2. CUSTOM FEEDS */}
          {customFeeds.map(feed => (
            <CustomFeedCard
              key={feed.id}
              feed={feed}
              fallbackStreamUrl={streamUrls['cam-2'] || api.getStreamUrl('cam-2')}
              onSnapshot={handleSnapshot}
              onRemove={handleRemoveCustomFeed}
              onCanvasRef={el => {
                simCanvasRefs.current[feed.id] = el;
              }}
            />
          ))}

          {/* 3. EMPTY SLOTS */}
          {Array.from({ length: emptySlotsCount }).map((_, i) => (
            <button
              key={`empty-${i}`}
              onClick={() => setIsAddModalOpen(true)}
              className="aspect-video rounded-[10px] border border-dashed border-primary-border hover:border-primary hover:bg-primary-surface/55 bg-surface/50 flex flex-col items-center justify-center gap-2 text-txt-secondary hover:text-primary transition-all cursor-pointer group"
            >
              <i className="ti ti-plus text-2xl group-hover:scale-110 transition-transform" aria-hidden="true" />
              <span className="text-xs font-bold font-mono tracking-wider">Add Video Feed</span>
            </button>
          ))}
        </div>
      </div>

      {/* Add Feed Modal Dialog */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.target === e.currentTarget && setIsAddModalOpen(false)}
          className="fixed inset-0 z-[200] bg-slate-950/30 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        >
          <SpatialOverlay className="ui-dialog spatial-glass-overlay max-w-[480px] w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h2 className="text-base font-bold font-display text-txt-primary m-0">
                Add a Video Feed
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close add feed dialog"
                className="w-7 h-7 rounded-lg hover:bg-primary-surface/60 text-txt-muted hover:text-txt-primary flex items-center justify-center text-sm"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            {/* Segmented Source Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-surface/70 border border-border-subtle rounded-[10px]">
              {([
                { id: 'cam', label: 'Live Camera', activeText: 'text-primary' },
                { id: 'rtsp', label: 'RTSP Stream', activeText: 'text-accent' },
                { id: 'file', label: 'Video File', activeText: 'text-info' },
              ] as const).map(tab => {
                const active = modalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setModalTab(tab.id)}
                    className={`relative py-2 rounded-[8px] text-xs font-bold transition-colors ${
                      active ? tab.activeText : 'text-txt-muted hover:text-txt-primary'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="add-feed-modal-tab"
                        transition={SPATIAL_SPRING}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-[8px] bg-surface shadow-xs border border-border-subtle pointer-events-none"
                      />
                    )}
                    <span className="relative z-[1]">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {modalTab === 'cam' && (
              <div className="space-y-3.5 pt-1">
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1.5">Select Camera Device</label>
                  <select
                    value={selectedDeviceId}
                    onChange={e => setSelectedDeviceId(e.target.value)}
                    className="w-full h-10 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none"
                  >
                    {availableDevices.length === 0 ? (
                      <option value="">Default System Camera</option>
                    ) : (
                      availableDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Camera Device #${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="text-[11px] text-txt-muted">Browser camera permission required.</div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleAddCamera(selectedDeviceId)}
                    className="flex-1 py-2.5 rounded-[10px] text-white font-bold text-xs brand-button transition-all cursor-pointer"
                  >
                    <i className="ti ti-video" aria-hidden="true" /> Add Live Camera
                  </button>
                </div>
              </div>
            )}

            {modalTab === 'rtsp' && (
              <div className="space-y-3.5 pt-1">
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1.5">Source Name (Optional)</label>
                  <input
                    type="text"
                    value={rtspName}
                    onChange={e => setRtspName(e.target.value)}
                    placeholder="E.g. CAM-02 Live RTSP Stream"
                    className="w-full h-10 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1.5">RTSP Stream Address</label>
                  <input
                    type="text"
                    value={rtspUrl}
                    onChange={e => setRtspUrl(e.target.value)}
                    placeholder="rtsp://192.168.1.120:554/stream1"
                    className="w-full h-10 px-3 rounded-[10px] border border-border-default bg-surface/85 text-txt-primary text-xs focus:border-primary focus:outline-none font-mono"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAddRtsp}
                    className="flex-1 py-2.5 rounded-[10px] text-white font-bold text-xs brand-button transition-all cursor-pointer"
                  >
                    <i className="ti ti-network" aria-hidden="true" /> Add RTSP Stream
                  </button>
                </div>
              </div>
            )}

            {modalTab === 'file' && (
              <div className="space-y-3 pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="video/*"
                  multiple
                  onChange={e => handleAddFiles(e.target.files)}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    handleAddFiles(e.dataTransfer.files);
                  }}
                  className="p-8 border border-dashed border-primary-border rounded-[10px] bg-primary-surface/40 hover:bg-primary-surface/70 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
                >
                  <span className="text-3xl text-primary mb-2"><i className="ti ti-upload" aria-hidden="true" /></span>
                  <b className="text-xs font-bold text-txt-primary">Drop video files</b>
                  <small className="text-[11px] text-txt-muted mt-1">MP4, WebM, MOV</small>
                </div>
              </div>
            )}
          </SpatialOverlay>
        </div>
      )}
    </div>
  );
};
