import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { getSceneSvg } from '../../services/mockScenes';
import { Camera, DetectionBox } from '../../types';

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
      className="group relative aspect-video rounded-xl overflow-hidden bg-[#050d17] border border-[#1f3d5a] hover:border-[#2dd4bf] hover:shadow-[0_0_0_3px_rgba(45,212,191,0.2)] transition-all"
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
            ✕
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
      <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSnapshot(c.name, isWebcam ? videoRef.current : imgRef.current)}
          title="Forensic Snapshot"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-[#12a79d] text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          ▣
        </button>
        <button
          onClick={() => onFullscreen(c.id)}
          title="Inspect & Enlarge"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-[#12a79d] text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          ⤢
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
      className="group relative aspect-video rounded-xl overflow-hidden bg-[#050d17] border border-[#1f3d5a] hover:border-[#2dd4bf] hover:shadow-[0_0_0_3px_rgba(45,212,191,0.2)] transition-all"
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
              ▶
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
        <span>{feed.type === 'demo' ? 'SIMULATED BORDER CANVASES' : feed.type === 'file' ? 'LOCAL MP4 STREAM' : 'ACTIVE INGEST'}</span>
        <span className="tabular-nums text-cyan-300">640×360</span>
      </div>

      {/* HOVER TOOLBAR */}
      <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => {
            const targetEl = feed.type === 'demo' ? canvasRef.current : feed.type === 'rtsp' ? imgRef.current : videoRef.current;
            onSnapshot(feed.name, targetEl);
          }}
          title="Forensic Snapshot"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-[#12a79d] text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          ▣
        </button>
        <button
          onClick={() => onRemove(feed.id)}
          title="Remove Feed"
          className="w-7 h-7 rounded-lg bg-[#0b1e34]/90 hover:bg-rose-600 text-white flex items-center justify-center text-xs transition-colors shadow-xs"
        >
          ✕
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

  // Add animated simulated feed
  const handleAddSimulated = () => {
    const newFeed: CustomFeed = {
      id: `demo-${Date.now()}`,
      type: 'demo',
      name: `Simulated Sector 0${customFeeds.length + 1}`,
      isSimulated: true
    };
    setCustomFeeds(prev => [...prev, newFeed]);
    setIsAddModalOpen(false);
    showNotice('success', `Added animated simulated feed: ${newFeed.name}`);
  };

  // Render animated simulated canvas
  useEffect(() => {
    const activeDemoFeeds = customFeeds.filter(f => f.type === 'demo');
    if (activeDemoFeeds.length === 0) return;

    let animId: number;
    const particles = activeDemoFeeds.map(() => [
      { x: Math.random() * 640, y: 220, vx: 1.2, isVehicle: false },
      { x: Math.random() * 640, y: 260, vx: -0.8, isVehicle: false },
      { x: Math.random() * 640, y: 310, vx: 2.2, isVehicle: true }
    ]);

    const render = () => {
      activeDemoFeeds.forEach((feed, idx) => {
        const canvas = simCanvasRefs.current[feed.id];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;

        // Background terrain gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#10253e');
        grad.addColorStop(0.5, '#193b58');
        grad.addColorStop(0.51, '#1b2d22');
        grad.addColorStop(1, '#0e1713');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Security fence lines
        ctx.strokeStyle = 'rgba(110, 150, 175, 0.25)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 28) {
          ctx.beginPath();
          ctx.moveTo(x, 150);
          ctx.lineTo(x, 220);
          ctx.stroke();
        }

        // Animated targets
        const targets = particles[idx];
        if (targets) {
          targets.forEach(t => {
            t.x += t.vx;
            if (t.x > W + 60) t.x = -60;
            if (t.x < -60) t.x = W + 60;

            const w = t.isVehicle ? 82 : 24;
            const h = t.isVehicle ? 36 : 60;
            const y = t.y - h;

            // Target body
            ctx.fillStyle = t.isVehicle ? '#7e9cb6' : '#cbd5e1';
            ctx.fillRect(t.x, y, w, h);

            // AI Bounding Box
            ctx.strokeStyle = '#2fd6c0';
            ctx.lineWidth = 2;
            ctx.strokeRect(t.x - 4, y - 4, w + 8, h + 8);

            // Bounding box label
            ctx.fillStyle = '#2fd6c0';
            ctx.font = 'bold 10.5px monospace';
            ctx.fillText(t.isVehicle ? 'VEHICLE 94%' : 'PERSON 98%', t.x - 4, y - 8);
          });
        }
      });
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [customFeeds]);

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
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5">
      
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <div>
        <div className="text-[11px] text-[#708197] dark:text-slate-400 mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-[#0b8d8b] font-bold">Live Monitor & Camera Wall</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
              Tactical Video Wall Matrix
            </h1>
            <p className="text-xs md:text-[13px] text-txt-muted mt-1 m-0">
              Every camera, RTSP stream, and forensic video feed orchestrated on a unified high-density surveillance wall.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleFullscreenWall}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border border-border-default text-xs font-bold text-txt-primary hover:shadow-md hover:-translate-y-0.5 transition-all shadow-xs"
            >
              <span>⤢</span>
              <span>Full screen</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] shadow-[0_6px_14px_rgba(11,141,139,0.25)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>＋</span>
              <span>Add feed</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4 CURATED DISTINCTLY COLOURED METRIC CARDS
          1. Teal (Active feeds)
          2. Blue (Connected Cameras)
          3. Purple (RTSP Streams)
          4. Orange (Simulated & Files)
          ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="Live Video Wall Metrics">
        
        {/* CARD 1: TEAL - ACTIVE FEEDS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#0b8d8b]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#0b8d8b]/10 dark:bg-[#0b8d8b]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Active feeds</span>
            <div className="w-8 h-8 rounded-lg bg-[#0b8d8b]/15 dark:bg-[#0b8d8b]/30 text-[#0b8d8b] dark:text-cyan-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ◉
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#0b8d8b] dark:text-cyan-300 mt-2 relative z-1 tabular-nums">
            {String(totalActiveOnWall).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Active on video matrix now
          </small>
        </div>

        {/* CARD 2: BLUE - CAMERAS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#5277d7]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#5277d7]/10 dark:bg-[#5277d7]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Cameras online</span>
            <div className="w-8 h-8 rounded-lg bg-[#5277d7]/15 dark:bg-[#5277d7]/30 text-[#5277d7] dark:text-blue-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ▣
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#5277d7] dark:text-blue-300 mt-2 relative z-1 tabular-nums">
            {String(connectedCamsCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Connected sector cameras
          </small>
        </div>

        {/* CARD 3: PURPLE - RTSP STREAMS */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#8165ca]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#8165ca]/10 dark:bg-[#8165ca]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">RTSP streams</span>
            <div className="w-8 h-8 rounded-lg bg-[#8165ca]/15 dark:bg-[#8165ca]/30 text-[#8165ca] dark:text-purple-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ↗
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#8165ca] dark:text-purple-300 mt-2 relative z-1 tabular-nums">
            {String(rtspStreamsCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Live network RTSP feeds
          </small>
        </div>

        {/* CARD 4: ORANGE - FILES */}
        <div className="bg-surface border border-border-default rounded-[14px] p-4 shadow-[0_10px_26px_rgba(32,62,93,0.05)] relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 border-t-[3px] border-t-[#c77a21]">
          <div className="absolute -right-5 -top-7 w-20 h-20 rounded-full bg-[#c77a21]/10 dark:bg-[#c77a21]/20 pointer-events-none" />
          <div className="flex items-center justify-between relative z-1">
            <span className="text-xs font-semibold text-[#708197] dark:text-slate-400">Forensic files</span>
            <div className="w-8 h-8 rounded-lg bg-[#c77a21]/15 dark:bg-[#c77a21]/30 text-[#c77a21] dark:text-amber-300 flex items-center justify-center font-bold text-sm shadow-xs">
              ▶
            </div>
          </div>
          <b className="block text-3xl font-extrabold font-mono tracking-tight text-[#c77a21] dark:text-amber-300 mt-2 relative z-1 tabular-nums">
            {String(simulatedOrFilesCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-[#708197] dark:text-slate-400 block mt-0.5 relative z-1">
            Local video files & forensics
          </small>
        </div>

      </section>

      {/* =========================================================================
          WALL CONTROLS BAR (Layout selector + Actions)
          ========================================================================= */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-surface p-2.5 px-3.5 rounded-2xl border border-border-default shadow-xs">
        {/* Layout Matrix Selector */}
        <div className="flex items-center bg-[#eef3f7] dark:bg-slate-800 p-1 rounded-xl gap-1">
          <button
            onClick={() => setLayout('2:4')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              layout === '2:4'
                ? 'bg-gradient-to-r from-[#0a7f9a] to-[#12a79a] text-white shadow-sm'
                : 'text-[#5d7186] dark:text-slate-300 hover:text-txt-primary'
            }`}
          >
            2×2
          </button>
          <button
            onClick={() => setLayout('3:6')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              layout === '3:6'
                ? 'bg-gradient-to-r from-[#0a7f9a] to-[#12a79a] text-white shadow-sm'
                : 'text-[#5d7186] dark:text-slate-300 hover:text-txt-primary'
            }`}
          >
            3×2
          </button>
          <button
            onClick={() => setLayout('3:9')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              layout === '3:9'
                ? 'bg-gradient-to-r from-[#0a7f9a] to-[#12a79a] text-white shadow-sm'
                : 'text-[#5d7186] dark:text-slate-300 hover:text-txt-primary'
            }`}
          >
            3×3
          </button>
          <button
            onClick={() => setLayout('4:12')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              layout === '4:12'
                ? 'bg-gradient-to-r from-[#0a7f9a] to-[#12a79a] text-white shadow-sm'
                : 'text-[#5d7186] dark:text-slate-300 hover:text-txt-primary'
            }`}
          >
            4×3
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {customFeeds.length > 0 && (
            <button
              onClick={handleStopAll}
              className="px-3 py-1.5 rounded-xl border border-border-default text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors"
            >
              ■ Stop all custom
            </button>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#0b8d8b] hover:bg-[#087778] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
          >
            <span>＋</span>
            <span>Add Feed</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          VIDEO WALL GRID CONTAINER
          ========================================================================= */}
      <div
        ref={wallRef}
        className="rounded-[20px] p-3 md:p-4 bg-gradient-to-br from-[#091829] via-[#0d2640] to-[#07121f] border border-[#1f3d5a] shadow-[0_20px_44px_rgba(10,30,51,0.35)]"
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

          {/* 2. CUSTOM FEEDS (WEBCAMS, RTSP, FILES, DEMO ANIMATION) */}
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

          {/* 3. EMPTY SLOTS WITH + ADD FEED */}
          {Array.from({ length: emptySlotsCount }).map((_, i) => (
            <button
              key={`empty-${i}`}
              onClick={() => setIsAddModalOpen(true)}
              className="aspect-video rounded-xl border-2 border-dashed border-[#2b4d6b] hover:border-[#2dd4bf] hover:bg-[#2dd4bf]/10 bg-[#0a1a2d]/50 flex flex-col items-center justify-center gap-2 text-[#7fa0ba] hover:text-[#5eead4] transition-all cursor-pointer group"
            >
              <span className="w-10 h-10 rounded-full border border-current flex items-center justify-center text-xl font-bold group-hover:scale-110 transition-transform">
                ＋
              </span>
              <span className="text-xs font-bold font-mono tracking-wider">Add Video Feed</span>
            </button>
          ))}
        </div>
      </div>

      {/* =========================================================================
          ADD FEED MODAL DIALOG
          ========================================================================= */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.target === e.currentTarget && setIsAddModalOpen(false)}
          className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-surface border border-border-default rounded-[20px] max-w-[480px] w-full p-6 shadow-2xl space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border-default">
              <h2 className="text-base font-bold text-txt-primary m-0 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#0b8d8b]" />
                Add a Video Feed
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-muted hover:text-txt-primary flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Segmented Source Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#eef3f7] dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setModalTab('cam')}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  modalTab === 'cam' ? 'bg-surface text-[#0b8d8b] shadow-xs' : 'text-txt-muted'
                }`}
              >
                Live Camera
              </button>
              <button
                onClick={() => setModalTab('rtsp')}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  modalTab === 'rtsp' ? 'bg-surface text-[#8165ca] shadow-xs' : 'text-txt-muted'
                }`}
              >
                RTSP Stream
              </button>
              <button
                onClick={() => setModalTab('file')}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  modalTab === 'file' ? 'bg-surface text-[#5277d7] shadow-xs' : 'text-txt-muted'
                }`}
              >
                Video File
              </button>
              <button
                onClick={() => setModalTab('demo')}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  modalTab === 'demo' ? 'bg-surface text-[#c77a21] shadow-xs' : 'text-txt-muted'
                }`}
              >
                Simulated
              </button>
            </div>

            {/* Tab 1: Local Camera Hardware */}
            {modalTab === 'cam' && (
              <div className="space-y-3.5 pt-2">
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1.5">Select Camera Device</label>
                  <select
                    value={selectedDeviceId}
                    onChange={e => setSelectedDeviceId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none"
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
                <p className="text-[12px] text-txt-muted leading-relaxed">
                  Requires browser permission for webcam media stream. Live sentry stream runs in high resolution with real-time AI perimeter analytics.
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleAddCamera(selectedDeviceId)}
                    className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] shadow-sm transition-all cursor-pointer"
                  >
                    ● Add Live Camera
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: RTSP Stream */}
            {modalTab === 'rtsp' && (
              <div className="space-y-3.5 pt-2">
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1.5">Source Name (Optional)</label>
                  <input
                    type="text"
                    value={rtspName}
                    onChange={e => setRtspName(e.target.value)}
                    placeholder="E.g. CAM-02 Live RTSP Stream"
                    className="w-full h-10 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-txt-primary mb-1.5">RTSP Stream Address</label>
                  <input
                    type="text"
                    value={rtspUrl}
                    onChange={e => setRtspUrl(e.target.value)}
                    placeholder="rtsp://192.168.1.120:554/stream1"
                    className="w-full h-10 px-3 rounded-xl border border-border-default bg-[#fbfcfd] dark:bg-[#14283d] text-txt-primary text-xs focus:border-[#0b8d8b] focus:outline-none font-mono text-xs"
                  />
                  <p className="text-[12px] text-txt-muted mt-1.5 leading-relaxed">
                    Enter the camera RTSP link directly. No external converter or gateway configuration is needed.
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAddRtsp}
                    className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#6a4fc4] to-[#8f72e6] hover:brightness-110 shadow-sm transition-all cursor-pointer"
                  >
                    ▶ Add RTSP Stream
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: Local Video File Dropzone */}
            {modalTab === 'file' && (
              <div className="space-y-3 pt-2">
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
                  className="p-8 border-2 border-dashed border-[#b7c9f2] dark:border-blue-900/50 rounded-2xl bg-[#f5f8ff] dark:bg-blue-950/20 hover:bg-blue-500/10 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
                >
                  <span className="text-3xl text-blue-500 mb-2">⇧</span>
                  <b className="text-xs font-bold text-txt-primary">Drop video files here</b>
                  <small className="text-[11px] text-txt-muted mt-1">or click to browse · MP4, WebM, MOV · plays directly</small>
                </div>
              </div>
            )}

            {/* Tab 4: Simulated Sector */}
            {modalTab === 'demo' && (
              <div className="space-y-3.5 pt-2">
                <p className="text-[12px] text-txt-muted leading-relaxed">
                  Generate an interactive simulated video sector with animated border fence terrain and simulated AI detections (vehicles and pedestrians).
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAddSimulated}
                    className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs bg-gradient-to-r from-[#c77a21] to-[#e08e2b] hover:brightness-110 shadow-sm transition-all cursor-pointer"
                  >
                    ★ Add Simulated Sector Feed
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
