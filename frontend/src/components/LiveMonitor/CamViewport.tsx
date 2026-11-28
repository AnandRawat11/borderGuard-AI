import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { getSceneSvg } from '../../services/mockScenes';
import { api, SingleFrameAnalysis } from '../../services/api';
import { isWebcamCapable } from '../../utils/camera';

export const CamViewport: React.FC = () => {
  const {
    cams,
    activeCamId,
    selectCam,
    webcamActive,
    webcamStream,
    isHardwareWebcam,
    webcamError,
    videoRef,
    activeStreamRef,
    liveDetections,
    webcamFps,
    isCamWebcamActive,
    telemetryFreshness,
    isFenceBreached,
    fenceStatus,
    openFullscreen,
    triggerWeaponDemo,
    toggleCamNight,
    startWebcam,
    currentUser,
    streamUrls,
    metrics,
    backendConnected,
    apiAvailable,
    demoMode
  } = useApp();

  const [simBoxes, setSimBoxes] = useState<any[]>([]);
  const [timeStamp, setTimeStamp] = useState<string>('');
  
  // Single-frame inspection & stepping states
  const [frozenFrameUrl, setFrozenFrameUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<SingleFrameAnalysis | null>(null);
  const [stepInfo, setStepInfo] = useState<string | null>(null);
  const [isInspectionMinimized, setIsInspectionMinimized] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cam = cams.find(c => c.id === activeCamId) || cams[0];

  // Capture single frame
  const handleCaptureSingleFrame = async () => {
    if (frozenFrameUrl) {
      // Resume live
      setFrozenFrameUrl(null);
      setAnalysisResult(null);
      setStepInfo(null);
      setIsInspectionMinimized(false);
      return;
    }
    try {
      setIsProcessing(true);
      if (isCurrentCamWebcam && videoRef.current) {
        // Capture frame from active live webcam
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setFrozenFrameUrl(dataUrl);
          setStepInfo(`Captured instantaneous webcam snapshot (${canvas.width}x${canvas.height})`);

          // Submit frame to backend for synchronous inspection
          canvas.toBlob(async (blob) => {
            if (blob) {
              try {
                const file = new File([blob], 'webcam_snapshot.jpg', { type: 'image/jpeg' });
                const res = await api.processSingleFrame(cam.id, file, currentUser?.accessToken);
                setAnalysisResult(res);
                setStepInfo(`Webcam frame analyzed: ${res.numDetections} objects (${res.processingTimeMs}ms)`);
              } catch (err) {
                console.warn('Backend analysis of webcam frame:', err);
              }
            }
          }, 'image/jpeg', 0.85);
        }
      } else {
        // Capture from backend video stream
        const url = api.getSingleFrameUrl(cam.id, currentUser?.accessToken);
        setFrozenFrameUrl(url);
        setStepInfo(`Captured instantaneous snapshot at ${new Date().toLocaleTimeString()}`);
        try {
          const res = await api.processSingleFrame(cam.id, undefined, currentUser?.accessToken);
          setAnalysisResult(res);
          setStepInfo(`Analyzed frame: ${res.numDetections} objects (${res.processingTimeMs}ms)`);
        } catch (err) {
          console.warn('Backend analysis of single frame:', err);
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(`Capture single frame error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 1 frame forward
  const handleStepFrame = async () => {
    try {
      setIsProcessing(true);
      const result = await api.stepFrame(cam.id, currentUser?.accessToken);
      const url = api.getSingleFrameUrl(cam.id, currentUser?.accessToken);
      setFrozenFrameUrl(url);
      setStepInfo(`Stepped to Frame #${result.frameIndex} (${result.detectionsCount} detections)`);
      try {
        const res = await api.processSingleFrame(cam.id, undefined, currentUser?.accessToken);
        setAnalysisResult(res);
      } catch (err) {
        console.warn('Step frame analysis:', err);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Step frame error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload frame for synchronous YOLO analysis
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessing(true);
      const objectUrl = URL.createObjectURL(file);
      setFrozenFrameUrl(objectUrl);
      setStepInfo(`Analyzing uploaded image: ${file.name}...`);

      // 1. Client-Side Neural AI Detection (MobileNetV2 COCO-SSD)
      const img = new Image();
      img.src = objectUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      let clientDets: any[] = [];
      try {
        const { loadCocoSsdModel } = await import('../../services/aiDetection');
        const model = await loadCocoSsdModel();
        const predictions = await model.detect(img);
        if (predictions && predictions.length > 0) {
          clientDets = predictions.map(p => {
            const [bx, by, bw, bh] = p.bbox;
            return {
              className: p.class,
              confidence: p.score,
              box: [Math.round(bx), Math.round(by), Math.round(bx + bw), Math.round(by + bh)] as [number, number, number, number],
              normalizedBox: [
                Math.max(0, Math.min(1, bx / img.width)),
                Math.max(0, Math.min(1, by / img.height)),
                Math.max(0, Math.min(1, (bx + bw) / img.width)),
                Math.max(0, Math.min(1, (by + bh) / img.height)),
              ] as [number, number, number, number]
            };
          });
          setAnalysisResult({
            camId: cam.id,
            timestamp: Date.now() / 1000,
            detections: clientDets,
            numDetections: clientDets.length,
            alertTriggered: clientDets.some(d => d.className === 'knife' || d.className === 'scissors'),
            alertType: clientDets.some(d => d.className === 'knife') ? 'weapon' : undefined,
            processingTimeMs: 24,
            detectorModel: 'MobileNetV2-COCO-SSD'
          });
          setStepInfo(`MobileNet AI: ${clientDets.length} target${clientDets.length !== 1 ? 's' : ''}`);
        }
      } catch (clientErr) {
        console.warn('Client detection fallback:', clientErr);
      }

      // 2. Server-Side YOLOv5/YOLOv8 ONNX Detection
      try {
        const res = await api.processSingleFrame(cam.id, file, currentUser?.accessToken);
        if (res.detections && res.detections.length > 0) {
          // If backend returned detections, use high-accuracy YOLO ONNX detections
          setAnalysisResult(res);
          setStepInfo(`YOLO ONNX: ${res.detections.length} target${res.detections.length !== 1 ? 's' : ''} (${res.processingTimeMs}ms)`);
        } else if (clientDets.length === 0) {
          setAnalysisResult(res);
          setStepInfo(`0 targets detected (${res.processingTimeMs}ms)`);
        }
      } catch (backendErr: any) {
        console.warn('Backend YOLO processing error:', backendErr);
        if (clientDets.length === 0) {
          alert(`Analysis error: ${backendErr.message}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`Frame analysis error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStamp(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-IN', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Jitter for simulated cams (only when backend is offline and not using webcam)
  useEffect(() => {
    if (!demoMode || !cam || !cam.online || isCamWebcamActive(cam.id) || apiAvailable) {
      setSimBoxes([]);
      return;
    }

    const updateSim = () => {
      const a = cam.anchor;
      const isArmy = cam.scene === 'gate' || cam.id === 'cam-2';
      const isWatch = !isArmy && Math.random() < 0.20;
      const jitter = () => (Math.random() - 0.5) * 2;
      setSimBoxes([{
        left: a.left + jitter(),
        top: a.top + jitter(),
        w: a.w,
        h: a.h,
        label: isArmy 
          ? `[BFT] ARMY PATROL 0.9${Math.floor(Math.random() * 9)}`
          : (isWatch ? '[ALERT] INTRUDER 0.9' + Math.floor(Math.random() * 9) : (cam.scene === 'gate' ? '[SIM] VEHICLE 0.' + (80 + Math.floor(Math.random() * 18)) : '[SIM] PERSON 0.' + (80 + Math.floor(Math.random() * 18)))),
        watch: isWatch,
        friendly: isArmy,
        sublabel: isArmy ? 'MIL-CAMO (VERIFIED)' : (isWatch ? 'CIVILIAN CASUAL' : undefined)
      }]);
    };

    updateSim();
    const interval = setInterval(updateSim, 3000);
    return () => clearInterval(interval);
  }, [activeCamId, cam?.online, isCamWebcamActive, apiAvailable, demoMode]);

  if (!cam) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-rind-500">
        <i className="ti ti-video-off text-4xl mb-2"></i>
        <div className="text-sm font-bold text-rind-200">No Cameras Configured</div>
      </div>
    );
  }

  const isCurrentCamWebcam = isCamWebcamActive(cam.id);
  const displayedBoxes = liveDetections.length > 0
    ? liveDetections
    : (isCurrentCamWebcam ? [] : (demoMode ? simBoxes : []));

  const personCount = displayedBoxes.filter(b => b.class === 'person').length > 0 || liveDetections.length > 0
    ? displayedBoxes.filter(b => b.class === 'person').length
    : (analysisResult && analysisResult.camId === cam.id)
    ? analysisResult.detections.filter(d => d.className.toLowerCase() === 'person').length
    : (cam.online ? 0 : null);

  const vehicleCount = displayedBoxes.filter(b => ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(b.class || '')).length > 0 || liveDetections.length > 0
    ? displayedBoxes.filter(b => ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(b.class || '')).length
    : (analysisResult && analysisResult.camId === cam.id)
    ? analysisResult.detections.filter(d => ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(d.className.toLowerCase())).length
    : (cam.online ? 0 : null);

  const currentFps = webcamFps > 0
    ? webcamFps
    : !cam.online
    ? 0
    : (metrics?.cameraTelemetry?.[cam.id]?.fps ?? cam.fps);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2.5 min-w-0 bg-transparent text-txt-primary">
      {/* Unified Surveillance Feeds & Controls Header */}
      <div className="spatial-glass flex items-center justify-between gap-3 shrink-0 px-3.5 py-2">
        {/* Left: Camera Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {cams.map(c => {
            const isSelected = c.id === activeCamId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCam(c.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-primary text-primary-text shadow-xs'
                    : 'bg-surface/65 text-txt-muted hover:text-txt-primary hover:bg-surface border border-border-default'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  c.online ? (isSelected ? 'bg-white' : 'bg-emerald-500') : 'bg-rose-500'
                }`} />
                <span>{c.name.split('·')[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Camera Status & Clean Action Tools */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status Badge */}
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-xs font-bold ${
            cam.online
              ? isCurrentCamWebcam
                ? isHardwareWebcam
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-primary-surface text-primary border border-primary/20'
                : 'bg-primary-surface text-primary border border-primary/20'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cam.online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span>
              {cam.online 
                ? (isCurrentCamWebcam 
                    ? (isHardwareWebcam ? 'Webcam AI' : 'Tactical Sentry (Live)') 
                    : 'Live Stream') 
                : 'Offline'}
            </span>
          </span>

          {/* Quick toggle to physical webcam if currently running on tactical sentry fallback */}
          {cam.online && isCurrentCamWebcam && !isHardwareWebcam && (
            <button
              onClick={startWebcam}
              className="p-1 px-2.5 rounded-[8px] border border-primary-border bg-primary-surface hover:bg-primary/15 text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Connect physical device camera"
            >
              <i className="ti ti-camera text-sm" />
              <span className="hidden sm:inline">Use Hardware Cam</span>
            </button>
          )}

          {cam.online && (
            <>
              {/* Snapshot / Freeze Toggle Button */}
              <button
                onClick={handleCaptureSingleFrame}
                className={`p-1.5 px-2.5 rounded-[8px] border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  frozenFrameUrl
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                    : 'bg-surface/70 text-txt-muted hover:text-txt-primary border-border-default'
                }`}
                title={frozenFrameUrl ? 'Resume Live Feed' : 'Snapshot / Freeze Frame'}
              >
                <i className={`ti ${frozenFrameUrl ? 'ti-player-play' : 'ti-camera'} text-sm`} />
                <span className="hidden sm:inline">{frozenFrameUrl ? 'Live' : 'Freeze'}</span>
              </button>

              {/* Night Mode IR Toggle */}
              <button
                onClick={() => toggleCamNight(cam.id)}
                className={`p-1.5 px-2.5 rounded-[8px] border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  cam.night
                    ? 'bg-violet-500/15 text-violet-500 border-violet-500/30'
                    : 'bg-surface/70 text-txt-muted hover:text-txt-primary border-border-default'
                }`}
                title="Toggle Night Vision (IR Mode)"
              >
                <i className={`ti ${cam.night ? 'ti-moon-stars' : 'ti-sun'} text-sm`} />
                <span className="hidden sm:inline">{cam.night ? 'IR Night' : 'Day'}</span>
              </button>
            </>
          )}

          {/* Fullscreen Expand */}
          <button
            onClick={() => openFullscreen(cam.id)}
            className="p-1.5 px-2 rounded-[8px] bg-surface/70 hover:bg-surface text-txt-muted hover:text-txt-primary border border-border-default text-xs transition-colors cursor-pointer"
            title="Fullscreen Monitor"
          >
            <i className="ti ti-maximize text-sm" />
          </button>
        </div>
      </div>

      {/* Main Viewport Box (Level 5 crisp dark media viewport) */}
      <div className="flex-1 min-h-0 bg-ink-950 border border-border-default rounded-[10px] overflow-hidden flex flex-col relative shadow-card">
        {/* Viewport Area */}
        <div className={`flex-1 relative bg-black min-h-0 overflow-hidden ${cam.night ? 'radial-night' : ''}`}>
          {/* Frozen Frame / Uploaded Image View */}
          {frozenFrameUrl && (
            <div className="absolute inset-0 z-10 bg-black flex items-center justify-center overflow-hidden">
              <div className="relative max-w-full max-h-full inline-flex items-center justify-center">
                <img
                  src={frozenFrameUrl}
                  alt="Frozen Frame"
                  className="max-w-full max-h-full object-contain block select-none pointer-events-none"
                />
              </div>

              {/* Clean Minimal Freeze Notification Pill */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/80 border border-amber-500/40 rounded-full px-3 py-1 text-xs text-amber-300 font-mono shadow-xl backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-bold">FRAME FROZEN</span>
                <button
                  onClick={handleCaptureSingleFrame}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full text-[11px] border border-amber-400/40 ml-1 transition-colors cursor-pointer"
                >
                  Resume Live
                </button>
              </div>
            </div>
          )}

          {/* Real Webcam / Live Tactical Stream Video for the selected camera */}
          <video
            ref={el => {
              if (videoRef) (videoRef as any).current = el;
              if (isCurrentCamWebcam && activeStreamRef) {
                (activeStreamRef as any).current = el;
              }
              if (el && webcamStream && el.srcObject !== webcamStream) {
                el.srcObject = webcamStream;
                el.play().catch(() => {});
              }
            }}
            onLoadedMetadata={e => {
              (e.target as HTMLVideoElement).play().catch(() => {});
            }}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover z-0 ${isCurrentCamWebcam ? 'block' : 'hidden'}`}
          />

          {/* Hardware Webcam Activation Prompt (Required because modern browsers block camera access on page load without user click) */}
          {cam.online && isCurrentCamWebcam && !isHardwareWebcam && !frozenFrameUrl && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/65 backdrop-blur-xs p-6 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-500/40 text-teal-300 flex items-center justify-center text-3xl mb-3 shadow-[0_0_24px_rgba(20,184,166,0.25)]">
                <i className="ti ti-camera" />
              </div>
              <h3 className="text-base md:text-lg font-bold text-white mb-4 font-display tracking-wide">
                Enable Laptop Camera Feed
              </h3>
              <button
                onClick={startWebcam}
                className="px-5 py-2.5 rounded-xl brand-button text-slate-950 font-bold text-xs md:text-sm flex items-center gap-2 shadow-lg shadow-teal-500/30 transition-all transform hover:scale-[1.03] active:scale-95 cursor-pointer"
              >
                <i className="ti ti-camera text-base" />
                <span>Start Laptop Camera</span>
              </button>
              {webcamError && (
                <div className="mt-3 text-[11px] text-amber-300 bg-amber-950/70 border border-amber-500/40 px-3 py-1.5 rounded-lg max-w-sm">
                  <i className="ti ti-alert-triangle" aria-hidden="true" /> {webcamError}
                </div>
              )}
            </div>
          )}

          {/* Live MJPEG Stream for RTSP feeds from FastAPI Backend */}
          {!isCurrentCamWebcam && cam.online && (
            <img
              ref={el => {
                if (!isCurrentCamWebcam && activeStreamRef) {
                  (activeStreamRef as any).current = el;
                }
              }}
              crossOrigin="anonymous"
              src={streamUrls[cam.id] || api.getStreamUrl(cam.id)}
              alt={cam.name}
              className="absolute inset-0 w-full h-full object-cover z-0"
              onError={(e) => {
                // Fallback to SVG if backend stream is not reached
                (e.currentTarget as HTMLElement).style.display = 'none';
                const fb = document.getElementById(`svg-fb-${cam.id}`);
                if (fb) fb.style.display = 'block';
              }}
            />
          )}

          {/* SVG Illustrated Fallback Scene */}
          {!isCurrentCamWebcam && cam.online && (
            <div
              id={`svg-fb-${cam.id}`}
              className="absolute inset-0 z-0 hidden"
              dangerouslySetInnerHTML={{ __html: getSceneSvg(cam.scene) }}
            />
          )}

          {/* Offline Screen */}
          {!cam.online && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#101313]">
              <i className="ti ti-video-off text-4xl text-slate-600" />
              <div className="text-xs text-rose-500 font-bold">Camera Offline</div>
              <div className="text-[11px] text-slate-500">Stream disconnected (Network Failure)</div>
            </div>
          )}

          {/* Subtle Vignette & Scanlines */}
          <div className="cv-vignette absolute inset-0 z-[1] pointer-events-none" />
          <div className="scanlines absolute inset-0 z-[2] pointer-events-none opacity-40" />

          {/* Virtual Fence Line */}
          {cam.online && (
            <div className={`fence-line ${fenceStatus === 'breach' ? 'breach' : (fenceStatus === 'near_warning' ? 'warning' : 'clear')}`}>
              <span className={`absolute right-3 bottom-1.5 font-mono text-[9px] font-bold tracking-wider px-2 py-0.5 rounded ${
                fenceStatus === 'breach'
                  ? 'bg-rose-950/90 text-rose-400 border border-rose-500/40 animate-pulse'
                  : (fenceStatus === 'near_warning'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-400/50'
                      : 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40')
              }`}>
                {fenceStatus === 'breach' ? 'BREACH DETECTED' : (fenceStatus === 'near_warning' ? 'BUFFER ZONE' : 'PERIMETER SECURE')}
              </span>
            </div>
          )}

          {/* Clean OSD Watermarks */}
          {cam.online && (
            <>
              {/* Top-Left: Camera ID & Name */}
              <div className="osd absolute top-3 left-3 font-mono font-semibold text-xs text-white/90 z-[5] pointer-events-none drop-shadow flex items-center gap-2 bg-black/50 backdrop-blur-xs px-2.5 py-1 rounded-md border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{cam.name}</span>
              </div>

              {/* Bottom-Left: Live Timestamp */}
              <div className="osd absolute bottom-3 left-3 font-mono text-[11px] text-white/70 z-[5] pointer-events-none drop-shadow">
                {timeStamp || new Date().toLocaleTimeString()}
              </div>

              {/* Bottom-Right: GPS / Location */}
              <div className="osd absolute bottom-3 right-3 font-mono text-[11px] text-white/70 z-[5] pointer-events-none drop-shadow">
                {cam.geo || 'GPS LOCKED'}
              </div>
            </>
          )}

          {/* Real-time Bounding Boxes Layer */}
          {cam.online && displayedBoxes.map((b, i) => (
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

          {/* Watchlist Match Floating Alert Banner */}
          {cam.online && displayedBoxes.some(b => b.class === 'watchlist') && (
            <div className="absolute top-12 left-3 z-10 px-3 py-1.5 rounded-lg bg-cyan-950/90 border border-cyan-400 text-cyan-200 text-xs font-bold flex items-center gap-2 shadow-[0_0_16px_rgba(6,182,212,0.5)] animate-pulse">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>WATCHLIST PERSON FOUND · REFERENCE MATCHED</span>
            </div>
          )}
        </div>

        {/* Viewport Footer Telemetry */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-surface border-t border-border-default text-xs text-txt-muted">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <i className="ti ti-users text-sm text-primary" />
              <strong className="text-txt-primary font-mono">{personCount !== null ? personCount : '--'}</strong>
              <span>persons</span>
            </span>
            <span className="flex items-center gap-1.5">
              <i className="ti ti-car text-sm text-info" />
              <strong className="text-txt-primary font-mono">{vehicleCount !== null ? vehicleCount : '--'}</strong>
              <span>vehicles</span>
            </span>
            <span className="flex items-center gap-1.5">
              <i className="ti ti-gauge text-sm text-status-warning" />
              <strong className="text-txt-primary font-mono">{currentFps}</strong>
              <span>fps</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-txt-muted truncate">
            <i className="ti ti-map-pin text-primary" />
            <span className="truncate">{cam.location}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
