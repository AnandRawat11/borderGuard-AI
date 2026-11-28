import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Camera, Alert, PageId, DetectionBox, TypeMeta, AlertState, WatchlistEntry } from '../types';
import { captureFrameWithBoxes } from '../services/evidenceCapture';
import { api, UserAuth, MetricsResponse, ReadinessResponse } from '../services/api';
import { soundService } from '../services/soundService';
import {
  isWebcamCapable,
  DEFAULT_WEBCAM_CAMERA_ID,
  resolveWebcamCamera,
  computeTelemetryFreshness,
  TELEMETRY_STALE_THRESHOLD_MS
} from '../utils/camera';

export const TYPE_META: Record<string, TypeMeta> = {
  intrusion: { label: 'Virtual Fence Intrusion', icon: 'ti-fence', cls: 'text-red bg-red-d border-red/30', sev: 'high' },
  weapon: { label: 'Guns, Firearms & Prohibited Weapons', icon: 'ti-crosshair', cls: 'text-red bg-red-d border-red/30', sev: 'high' },
  watchlist: { label: 'Watchlist Candidate', icon: 'ti-fingerprint', cls: 'text-red bg-red-d border-red/30', sev: 'high' },
  anpr: { label: 'ANPR Plate Match', icon: 'ti-license', cls: 'text-blue bg-blue-d border-blue/30', sev: 'med' },
  loiter: { label: 'Loitering Detected', icon: 'ti-walk', cls: 'text-amber bg-amber-d border-amber/30', sev: 'med' },
  night: { label: 'Night Movement', icon: 'ti-moon', cls: 'text-violet bg-violet-d border-violet/30', sev: 'low' }
};

const DEMO_CAMS: Camera[] = [
  { id: 'cam-1', name: 'CAM-01 · Live Camera Feed', location: 'BOP Alpha — Tactical Sentry', online: true, priority: 'High', fps: 15, night: false, scene: 'fence', geo: '29.5481°N 74.8763°E', anchor: { left: 44, top: 46, w: 12, h: 26 }, rtspUrl: '', supportsWebcam: true, sourceType: 'webcam' },
  { id: 'cam-2', name: 'CAM-02 · Live RTSP Stream', location: 'Perimeter Sector — RTSP Ingest', online: true, priority: 'High', fps: 12, night: false, scene: 'gate', geo: '29.5502°N 74.8791°E', anchor: { left: 41, top: 52, w: 18, h: 24 }, rtspUrl: 'rtsp://192.168.1.120:554/stream1', supportsWebcam: false, sourceType: 'rtsp' },
];

let alertSeq = 1;
export function mkAlert(
  type: string,
  camId: string,
  minsAgo: number,
  detail: string,
  reviewed = false,
  snapshot?: string | null,
  customConf?: number,
  provenance: 'detector' | 'simulation' = 'detector',
  camera?: Camera,
  trackId?: string,
  verificationStatus: 'potential' | 'verified_ai' | 'officer_reviewed' = 'verified_ai',
  supportingDetections = 1,
  firstDetectedAt?: Date | string | null,
  lastDetectedAt?: Date | string | null
): Alert {
  const cam = camera || DEMO_CAMS.find(c => c.id === camId) || DEMO_CAMS[0];
  const t = new Date(Date.now() - minsAgo * 60000);
  const meta = TYPE_META[type] || TYPE_META.intrusion;
  return {
    id: 'EVT-' + String(alertSeq++).padStart(4, '0'),
    type: type as any,
    sev: meta.sev,
    camId: cam.id,
    camName: cam.name,
    location: cam.location,
    confidence: customConf || Math.round((0.78 + Math.random() * 0.2) * 100),
    trackId: trackId || ('#' + (100 + Math.floor(Math.random() * 900))),
    detail,
    reviewed,
    state: reviewed ? 'resolved' : 'open',
    provenance,
    verificationStatus: reviewed ? 'officer_reviewed' : verificationStatus,
    supportingDetections,
    firstDetectedAt: firstDetectedAt || t,
    lastDetectedAt: lastDetectedAt || t,
    ruleId: `rule-${cam.id}-01`,
    ruleVersion: '1.0',
    ts: t,
    snapshot: snapshot || null,
  };
}

const isSimulationAlert = (alert: Alert): boolean => (
  alert.provenance === 'simulation'
  || String(alert.detail || '').toUpperCase().includes('[SIMULATION]')
);

interface AppContextType {
  cams: Camera[];
  alerts: Alert[];
  activeCamId: string;
  currentPage: PageId;
  armed: boolean;
  webcamStream: MediaStream | null;
  webcamActive: boolean;
  isHardwareWebcam: boolean;
  webcamError: string | null;
  liveDetections: DetectionBox[];
  webcamFps: number;
  cam1Fps: number;
  webcamCam: Camera | null;
  webcamCamId: string | null;
  isCamWebcamActive: (camId?: string | null) => boolean;
  isFenceBreached: boolean;
  fenceStatus: 'clear' | 'near_warning' | 'breach';
  activeLightboxAlert: Alert | null;
  fullscreenCamId: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  activeStreamRef: React.MutableRefObject<HTMLImageElement | HTMLVideoElement | null>;
  currentUser: UserAuth | null;
  streamUrls: Record<string, string>;
  demoMode: boolean;
  backendConnected: boolean;
  apiAvailable: boolean;
  websocketConnected: boolean;
  metrics: MetricsResponse | null;
  lastMetricsAt: number | null;
  telemetryFreshness: 'live' | 'stale' | 'unavailable';
  readiness: ReadinessResponse | null;
  latencyPingMs: number | null;
  notice: { type: 'error' | 'success'; message: string } | null;
  mobileMenuOpen: boolean;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  toggleArmed: () => void;
  selectCam: (id: string) => void;
  goToPage: (page: PageId) => void;
  markReviewed: (id: string, reason?: string) => void;
  updateAlertState: (id: string, state: AlertState, assignedTo?: string, note?: string) => void;
  openLightbox: (id: string) => void;
  closeLightbox: () => void;
  openFullscreen: (camId: string) => void;
  closeFullscreen: () => void;
  triggerWeaponDemo: () => void;
  addAlert: (alert: Alert) => void;
  toggleCamOnline: (id: string) => void;
  toggleCamNight: (id: string) => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  switchRoleDemo: (role: 'operator' | 'supervisor' | 'admin') => Promise<void>;
  startWebcam: () => Promise<void>;
  stopWebcam: () => void;
  showNotice: (type: 'error' | 'success', message: string) => void;
  dismissNotice: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  activePatrolAlert: Alert | null;
  openPatrolModal: (alert?: Alert) => void;
  closePatrolModal: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  soundVolume: number;
  setSoundVolume: (volume: number) => void;
  isSirenActive: boolean;
  silenceSiren: () => void;
  testSound: (sev: 'high' | 'med' | 'low') => void;
  desktopNotificationsEnabled: boolean;
  toggleDesktopNotifications: () => Promise<boolean>;
  activeCriticalAlert: Alert | null;
  dismissCriticalBanner: () => void;
  escalateAlert: (id: string, target: string, notes?: string, deadlineMinutes?: number) => Promise<void>;
  bulkUpdateAlerts: (ids: string[], state: AlertState, reasonCode?: string, notes?: string) => Promise<void>;
  watchlistEntries: WatchlistEntry[];
  refreshWatchlist: () => Promise<void>;
  addCamera: (cameraData: Partial<Camera> & { name: string; rtspUrl?: string }) => Promise<Camera>;
  removeCamera: (camId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

// Demo data and local role switching are opt-in. Production must establish an
// authenticated session through the explicit login flow.
export const DEMO_MODE = String((import.meta as any).env?.VITE_DEMO_MODE || '').toLowerCase() === 'true';

// Read initial page from browser location path
const getInitialPage = (): PageId => {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.replace(/^\//, '').toLowerCase();
    const validPages: PageId[] = ['dashboard', 'monitor', 'camgrid', 'alerts', 'vault', 'analytics', 'models', 'cam-config', 'watchlist', 'features', 'contact', 'privacy', 'terms', 'ai-investigation', 'ai-briefing', 'dashboard-settings'];
    if (validPages.includes(path as PageId)) return path as PageId;
    if (!path || path === 'index.html') return 'dashboard';
    if (path === 'overview') return 'dashboard';
    if (path === 'timeline') return 'analytics';
    if (path === 'cameras') return 'camgrid';
  }
  return 'not-found';
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const [cams, setCams] = useState<Camera[]>(DEMO_MODE ? DEMO_CAMS : []);
  const [streamUrls, setStreamUrls] = useState<Record<string, string>>({});
  const [wsGrant, setWsGrant] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeCamId, setActiveCamId] = useState<string>('cam-1');
  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPage);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('ibvap-theme');
      if (saved === 'dark') return 'dark';
    } catch {
      // Ignore storage access errors
    }
    return 'light'; // Porcelain light mode is default per Spatial Glass specification
  });

  // Listen to browser back/forward buttons
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.page) {
        setCurrentPage(e.state.page);
      } else {
        setCurrentPage(getInitialPage());
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('ibvap-theme', theme);
    } catch (e) {
      console.warn('Could not persist theme to localStorage', e);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const [armed, setArmed] = useState<boolean>(true);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamActive, setWebcamActive] = useState<boolean>(DEMO_MODE);
  const [isHardwareWebcam, setIsHardwareWebcam] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [liveDetections, setLiveDetections] = useState<DetectionBox[]>([]);
  const [webcamFps, setWebcamFps] = useState<number>(0);
  const cam1Fps = webcamFps;
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [lastMetricsAt, setLastMetricsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [latencyPingMs, setLatencyPingMs] = useState<number | null>(null);
  const [isFenceBreached, setIsFenceBreached] = useState<boolean>(false);
  const [fenceStatus, setFenceStatus] = useState<'clear' | 'near_warning' | 'breach'>('clear');
  const [activeLightboxAlert, setActiveLightboxAlert] = useState<Alert | null>(null);
  const [fullscreenCamId, setFullscreenCamId] = useState<string | null>(null);

  // Tactical Audio & Alert Sound State
  const [soundMuted, setSoundMuted] = useState<boolean>(() => soundService.getMuted());
  const [soundVolumeState, setSoundVolumeState] = useState<number>(() => soundService.getVolume());
  const [isSirenActive, setIsSirenActive] = useState<boolean>(() => soundService.isSirenOn());
  const [desktopNotifs, setDesktopNotifs] = useState<boolean>(() => soundService.getDesktopNotifications());
  const [dismissedCriticalId, setDismissedCriticalId] = useState<string | null>(null);

  useEffect(() => {
    return soundService.subscribe(() => {
      setSoundMuted(soundService.getMuted());
      setSoundVolumeState(soundService.getVolume());
      setIsSirenActive(soundService.isSirenOn());
      setDesktopNotifs(soundService.getDesktopNotifications());
    });
  }, []);

  // Compute active critical alert for high-contrast Emergency Banner
  const activeCriticalAlert = useMemo<Alert | null>(() => {
    if (!armed) return null;
    const topUrgent = alerts.find(a => (a.sev === 'high' || a.type === 'weapon') && (!a.reviewed && (a.state === 'open' || !a.state)));
    if (!topUrgent || topUrgent.id === dismissedCriticalId) return null;
    return topUrgent;
  }, [alerts, armed, dismissedCriticalId]);

  // Authentication & Backend Status
  const [currentUser, setCurrentUser] = useState<UserAuth | null>(() => {
    try {
      const saved = localStorage.getItem('ibvap_auth');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { return null; }
      }
    } catch {
      // Storage may be unavailable in privacy-restricted browsers.
    }
    return DEMO_MODE ? { username: 'operator', role: 'operator', accessToken: '' } : null;
  });
  const [apiAvailable, setApiAvailable] = useState<boolean>(false);
  const [websocketConnected, setWebsocketConnected] = useState<boolean>(false);
  const backendConnected = apiAvailable;
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePatrolAlert, setActivePatrolAlert] = useState<Alert | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const activeCamIdRef = useRef<string>(activeCamId);
  useEffect(() => {
    activeCamIdRef.current = activeCamId;
  }, [activeCamId]);
  const ALERT_COOLDOWN_MS = 30000; // 30 seconds configurable cooldown per Feature 2 & 6
  const lastIntrusionRef = useRef<number>(0);
  const lastWeaponRef = useRef<number>(0);
  const lastLoiterRef = useRef<number>(0);
  const lastBufferLoiterRef = useRef<number>(0);
  const lastWatchlistRef = useRef<number>(0);
  const intrusionLatchedRef = useRef<boolean>(false);
  const watchlistLatchedRef = useRef<boolean>(false);
  const crawlLatchedRef = useRef<boolean>(false);

  // Feature 3: Temporal weapon verification rolling history
  const weaponHistoryRef = useRef<Array<{ timestamp: number; class: string; score: number; bbox: number[] }>>([]);
  const weaponLatchedRef = useRef<boolean>(false);

  // Feature 1: Persistent client track IDs across frames
  const clientTracksRef = useRef<Map<string, { trackId: string; centroid: [number, number]; lastSeen: number }>>(new Map());
  const nextTrackIdRef = useRef<number>(101);

  const [watchlistEntries, setWatchlistEntries] = useState<WatchlistEntry[]>([]);
  const watchlistEntriesRef = useRef<WatchlistEntry[]>([]);

  const refreshWatchlist = useCallback(async () => {
    try {
      const siteId = currentUser?.siteIds?.find(id => id !== '*') || 'site-alpha';
      const res = await api.getWatchlist(siteId, currentUser?.accessToken);
      if (res && Array.isArray(res.entries)) {
        setWatchlistEntries(res.entries);
        watchlistEntriesRef.current = res.entries;
      }
    } catch {
      // ignore
    }
  }, [currentUser?.siteIds, currentUser?.accessToken]);

  useEffect(() => {
    void refreshWatchlist();
  }, [refreshWatchlist]);

  const bufferTrackerRef = useRef<{ firstSeen: number | null; alerted: boolean }>({
    firstSeen: null,
    alerted: false
  });
  const weaponStreakRef = useRef<number>(0);
  const loiterTrackerRef = useRef<{ firstSeen: number | null; lastSeen: number | null; center: { cx: number; cy: number } | null; alerted: boolean }>({
    firstSeen: null,
    lastSeen: null,
    center: null,
    alerted: false
  });
  const fpsCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());

  // Clock tick to evaluate telemetry freshness every second
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetry freshness: live (<15s), stale (>=15s), or unavailable
  const telemetryFreshness = useMemo<'live' | 'stale' | 'unavailable'>(() => {
    return computeTelemetryFreshness(metrics, lastMetricsAt, nowTick);
  }, [metrics, lastMetricsAt, nowTick]);

  // Centralized resolution of webcam-capable camera
  const webcamCam = useMemo(() => {
    return resolveWebcamCamera(cams);
  }, [cams]);

  const webcamCamId = webcamCam?.id ?? null;

  const isCamWebcamActive = useCallback((camId?: string | null): boolean => {
    if (!camId) return false;
    const target = cams.find(c => c.id === camId);
    return isWebcamCapable(target);
  }, [cams]);

  // Synchronize with backend on mount or user change
  useEffect(() => {
    let mounted = true;
    async function loadBackend() {
      try {
        let token = currentUser?.accessToken;
        let isTokenExpired = false;
        if (token) {
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.exp && Date.now() >= payload.exp * 1000 - 30000) {
                isTokenExpired = true;
              }
            }
          } catch {
            isTokenExpired = true;
          }
        }

        if (isTokenExpired) {
          if (mounted) {
            setCurrentUser(null);
            localStorage.removeItem('ibvap_auth');
          }
          token = undefined;
        }

        const pingStart = performance.now();
        const [camsRes, alertsRes, metricsRes, readyRes] = await Promise.all([
          api.getCameras(token).catch(() => null),
          api.getAlerts(undefined, token).catch(() => null),
          api.getMetrics(token).catch(() => null),
          api.getReadiness().catch(() => null)
        ]);
        if (!mounted) return;
        setLatencyPingMs(Math.round(performance.now() - pingStart));
        setApiAvailable(Boolean(camsRes || alertsRes || metricsRes || readyRes));
        if (camsRes) {
          setCams(camsRes);
          if (camsRes.length > 0) {
            setActiveCamId(prev => camsRes.some(c => c.id === prev) ? prev : camsRes[0].id);
          }
        }
        if (alertsRes) {
          setAlerts(DEMO_MODE ? alertsRes : alertsRes.filter(alert => !isSimulationAlert(alert)));
        }
        if (metricsRes) {
          setMetrics(metricsRes);
          setLastMetricsAt(Date.now());
        }
        if (readyRes) setReadiness(readyRes);
      } catch (err) {
        console.warn('Backend sync error (using local fallback):', err);
      }
    }
    loadBackend();
    return () => { mounted = false; };
  }, [currentUser?.accessToken]);

  // Browser media elements and native WebSockets cannot set Authorization
  // headers. Refresh narrowly scoped grants before they expire instead of
  // leaking the long-lived bearer token into a URL.
  useEffect(() => {
    let cancelled = false;

    const refreshBrowserGrants = async () => {
      const token = currentUser?.accessToken;
      if (!token || cams.length === 0) {
        if (!cancelled) {
          setStreamUrls({});
          setWsGrant(null);
        }
        return;
      }

      const [cameraGrants, alertGrant] = await Promise.all([
        Promise.all(cams.map(async cam => {
          try {
            const result = await api.issueCameraMediaGrant(cam.id, token);
            return [cam.id, api.getStreamUrl(cam.id, result.grant)] as const;
          } catch {
            return null;
          }
        })),
        api.issueWebSocketGrant(token).catch(() => null),
      ]);

      if (cancelled) return;
      setStreamUrls(Object.fromEntries(cameraGrants.filter(Boolean) as Array<readonly [string, string]>));
      setWsGrant(alertGrant?.grant || null);
    };

    void refreshBrowserGrants();
    const refreshTimer = window.setInterval(refreshBrowserGrants, 240_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [currentUser?.accessToken, cams.map(cam => cam.id).join(',')]);

  // WebSocket Live Alerts Subscription (FR-5.2)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isCancelled = false;

    function connect() {
      if (isCancelled || !currentUser?.accessToken || !wsGrant) return;
      try {
        const url = api.getWsUrl(wsGrant);
        ws = new WebSocket(url);
        ws.onopen = () => {
          if (!isCancelled) setWebsocketConnected(true);
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.event === 'new_alert' && msg.data) {
              const incoming: Alert = {
                ...msg.data,
                ts: new Date(msg.data.ts)
              };
              if (!DEMO_MODE && isSimulationAlert(incoming)) return;
              setAlerts(prev => {
                if (prev.some(a => a.id === incoming.id)) return prev;
                return [incoming, ...prev];
              });

              // Audible notification cue & OS desktop notification
              if (armed) {
                soundService.playAlertSound(incoming.sev);
                if (incoming.sev === 'high') {
                  soundService.dispatchDesktopNotification(`[CRITICAL ALERT] ${incoming.type.toUpperCase()}`, {
                    body: `${incoming.camName}: ${incoming.detail}`,
                    requireInteraction: true
                  });
                }
              }
            } else if (msg.event === 'alert_updated' && msg.data) {
              const updated = msg.data;
              setAlerts(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated, ts: new Date(updated.ts) } : a));
            } else if (msg.event === 'alert_escalated' && msg.data) {
              const esc = msg.data;
              setAlerts(prev => prev.map(a => a.id === esc.alertId ? {
                ...a,
                state: 'escalated' as any,
                escalationTarget: esc.escalationTarget,
                escalationDeadline: esc.deadlineTs ? new Date(esc.deadlineTs) : undefined
              } : a));
            } else if (msg.event === 'bulk_alerts_updated' && msg.data) {
              const { alertIds, newState } = msg.data;
              setAlerts(prev => prev.map(a => alertIds.includes(a.id) ? { ...a, state: newState, reviewed: true } : a));
            } else if (msg.event === 'siren_silenced') {
              soundService.stopSiren();
            } else if (msg.event === 'telemetry_update' && msg.data) {
              const normalized = api.normalizeMetrics(msg.data);
              setMetrics(normalized);
              setLastMetricsAt(Date.now());
            }
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };
        ws.onerror = () => {
          if (!isCancelled) setWebsocketConnected(false);
        };
        ws.onclose = () => {
          if (!isCancelled) {
            setWebsocketConnected(false);
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (e) {
        if (!isCancelled) reconnectTimeout = setTimeout(connect, 3000);
      }
    }

    connect();
    return () => {
      isCancelled = true;
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [currentUser?.accessToken, wsGrant]);

  // Tactical Synthetic Border Patrol Stream Generator
  // Produces an animated 1280x720 video MediaStream with live sentry movement and telemetry HUD
  const createTacticalStream = useCallback((): MediaStream | null => {
    try {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof (canvas as any).captureStream !== 'function') return null;

      let patrolX = 280;
      let patrolDir = 1;

      const drawFrame = () => {
        patrolX += 1.3 * patrolDir;
        if (patrolX > 1020) patrolDir = -1;
        if (patrolX < 240) patrolDir = 1;

        // Dark military border sky & terrain gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, 720);
        bgGrad.addColorStop(0, '#040d1a');
        bgGrad.addColorStop(0.58, '#0b2034');
        bgGrad.addColorStop(0.59, '#152b22');
        bgGrad.addColorStop(1, '#07150e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1280, 720);

        // Grid scan lines
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 1280; x += 100) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 720);
          ctx.stroke();
        }
        for (let y = 0; y < 720; y += 80) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(1280, y);
          ctx.stroke();
        }

        // Virtual fence boundary line
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 8]);
        ctx.beginPath();
        ctx.moveTo(0, 490);
        ctx.lineTo(1280, 490);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tactical sentry post tower
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(100, 240, 100, 250);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(80, 220, 140, 25);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(135, 260, 30, 40);

        // Sentry patrol figure
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(patrolX, 415, 14, 0, Math.PI * 2); // Head
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(patrolX - 12, 431, 24, 45);   // Torso
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(patrolX - 10, 476, 8, 35);    // Left leg
        ctx.fillRect(patrolX + 2, 476, 8, 35);     // Right leg

        // Sentry rifle silhouette
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(patrolX + 8, 438, 32, 5);

        // Telemetry HUD overlay
        ctx.fillStyle = 'rgba(45, 212, 191, 0.85)';
        ctx.font = 'bold 13px monospace';
        const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
        ctx.fillText(`TACTICAL SENTRY [ACTIVE] | UTC: ${dateStr}Z | SENSOR: 1080P HD`, 35, 72);

        // Center crosshair
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.4)';
        ctx.strokeRect(600, 320, 80, 80);
        ctx.beginPath();
        ctx.moveTo(640, 305);
        ctx.lineTo(640, 415);
        ctx.moveTo(585, 360);
        ctx.lineTo(695, 360);
        ctx.stroke();
      };

      const interval = setInterval(drawFrame, 40); // 25 FPS
      const stream = (canvas as any).captureStream(25);
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        clearInterval(interval);
      });
      return stream;
    } catch (e) {
      console.warn('Tactical stream creation error:', e);
      return null;
    }
  }, []);

  const startWebcam = async () => {
    try {
      const targetCam = resolveWebcamCamera(cams);
      if (targetCam && activeCamId !== targetCam.id) {
        setActiveCamId(targetCam.id);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
      }
      setWebcamStream(stream);
      setWebcamActive(true);
      setIsHardwareWebcam(true);
      setWebcamError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      showNotice('success', 'Hardware device webcam connected and streaming.');
    } catch (err: any) {
      console.warn('Physical webcam request error:', err);
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please click the lock or camera icon in your browser address bar to Allow camera access.'
        : (err.message || 'Camera access blocked or busy.');
      setWebcamError(msg);
      // A synthetic stream is useful for an explicitly enabled demo, but must
      // never look like a real camera in normal/offline operation.
      if (DEMO_MODE && !webcamStream) {
        const synStream = createTacticalStream();
        if (synStream) {
          setWebcamStream(synStream);
          setWebcamActive(true);
          setIsHardwareWebcam(false);
          if (videoRef.current) {
            videoRef.current.srcObject = synStream;
            videoRef.current.play().catch(() => {});
          }
        }
      }
      showNotice('error', msg);
    }
  };

  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
    }
    setWebcamStream(null);
    setWebcamActive(false);
    setIsHardwareWebcam(false);
  };

  // Request a hardware camera on mount. The generated tactical stream is
  // restricted to VITE_DEMO_MODE so an offline deployment never shows a fake
  // feed as if it were a connected sensor.
  useEffect(() => {
    let mounted = true;
    async function initCameraByDefault() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setWebcamStream(stream);
        setWebcamActive(true);
        setIsHardwareWebcam(true);
        setWebcamError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('Physical camera auto-start unavailable:', err);
        if (mounted && DEMO_MODE) {
          const synStream = createTacticalStream();
          if (synStream) {
            setWebcamStream(synStream);
            setWebcamActive(true);
            setIsHardwareWebcam(false);
            if (videoRef.current) {
              videoRef.current.srcObject = synStream;
              videoRef.current.play().catch(() => {});
            }
          }
        } else if (mounted) {
          setWebcamError(err?.message || 'No hardware camera is available.');
        }
      }
    }
    initCameraByDefault();

    return () => {
      mounted = false;
    };
  }, []); // Run ONCE on mount so stream is never terminated on cams state updates!

  // Synchronize video element whenever ref or stream is ready
  useEffect(() => {
    if (videoRef.current && webcamStream) {
      if (videoRef.current.srcObject !== webcamStream) {
        videoRef.current.srcObject = webcamStream;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [webcamStream, activeCamId]);

  // AI Object Detection Loop
  useEffect(() => {
    let intervalId: any = null;
    let isProcessing = false;
    let disposed = false;

    async function startLoop() {
      const { loadCocoSsdModel } = await import('../services/aiDetection');
      if (disposed) return;
      const model = await loadCocoSsdModel();
      if (disposed) return;

      // High-speed offscreen canvas for rapid 20-30ms inference (downsampled from HD video)
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = 480;
      offscreenCanvas.height = 270;
      const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

      intervalId = setInterval(async () => {
        if (isProcessing || !offscreenCtx) return;

        // Resolve active visual source: active RTSP stream element or active webcam video element
        const sourceEl = activeStreamRef.current || (webcamActive ? videoRef.current : null);
        if (!sourceEl) return;

        // Ensure video or image is fully loaded and ready for rendering
        if (sourceEl instanceof HTMLVideoElement) {
          if (sourceEl.readyState < 2 || sourceEl.paused || sourceEl.ended) return;
        } else if (sourceEl instanceof HTMLImageElement) {
          if (!sourceEl.complete || sourceEl.naturalWidth === 0) return;
        } else {
          return;
        }

        isProcessing = true;
        try {
          // Render current video frame to fast offscreen canvas
          try {
            offscreenCtx.drawImage(sourceEl, 0, 0, 480, 270);
          } catch {
            return; // Skip tick if transient cross-origin or decode issue occurs
          }

          // Fast inference with ultra-sensitive minScore=0.04 so blades/knives trigger instantaneously
          const predictions = await model.detect(offscreenCanvas, 25, 0.04);

          const boxes: DetectionBox[] = [];
          interface TrackedPerson { left: number; top: number; w: number; h: number; score: number; }
          interface TrackedWeapon { class: string; score: number; left: number; top: number; w: number; h: number; }

          let detectedPerson: TrackedPerson | null = null;
          let detectedWeaponCandidate: TrackedWeapon | null = null;
          let matchedWatchlistSubject: { name: string; score: number } | null = null;

          // 1. Gather active watchlist references and person candidates
          // Temporal weapon history pruning (Feature 3: 2.0s rolling window)
          const nowMs = Date.now();
          weaponHistoryRef.current = weaponHistoryRef.current.filter(
            entry => (nowMs - entry.timestamp) <= 2000
          );

          for (let idx = 0; idx < predictions.length; idx++) {
            const p = predictions[idx];
            const isPerson = p.class === 'person';

            // Feature 3: Strict weapon candidates.
            // Ordinary handheld items (toothbrush, remote, cell phone, bottle, utensils) are NEVER classified as weapons!
            const isFirearm = ['gun', 'pistol', 'rifle', 'firearm'].includes(p.class);
            const isDirectKnife = ['knife', 'scissors', 'dagger', 'sword'].includes(p.class);
            const isCandidateWeapon = isFirearm || isDirectKnife || (p.class === 'baseball bat');

            // Responsive thresholds: 0.15 for weapon candidates, 0.25 for person, 0.18 for all other objects
            const minScore = isCandidateWeapon ? 0.15 : (isPerson ? 0.25 : 0.18);
            if (p.score < minScore) continue;

            const [bx, by, bw, bh] = p.bbox;
            // Map 480x270 offscreen coordinates back to 0-100% viewport percentages
            const leftPct = (bx / 480) * 100;
            const topPct = (by / 270) * 100;
            const wPct = (bw / 480) * 100;
            const hPct = (bh / 270) * 100;

            if (isPerson) {
              detectedPerson = { left: leftPct, top: topPct, w: wPct, h: hPct, score: p.score };
            }

            if (isCandidateWeapon) {
              if (!detectedWeaponCandidate || p.score > detectedWeaponCandidate.score) {
                detectedWeaponCandidate = { class: p.class, score: p.score, left: leftPct, top: topPct, w: wPct, h: hPct };
              }
              // Accumulate in temporal rolling window
              weaponHistoryRef.current.push({
                timestamp: nowMs,
                class: p.class,
                score: p.score,
                bbox: [leftPct, topPct, wPct, hPct]
              });
            }

            // Feature 1: Persistent Person Tracking on Client
            let personTrackId = '';
            if (isPerson) {
              const centroidX = leftPct + wPct / 2;
              const centroidY = topPct + hPct / 2;
              let bestTrackId = '';
              let minDistance = 25.0; // Distance gate in %

              clientTracksRef.current.forEach((track, tid) => {
                const dist = Math.hypot(centroidX - track.centroid[0], centroidY - track.centroid[1]);
                if (dist < minDistance && (nowMs - track.lastSeen) < 10000) {
                  minDistance = dist;
                  bestTrackId = tid;
                }
              });

              if (bestTrackId) {
                personTrackId = bestTrackId;
                clientTracksRef.current.set(bestTrackId, {
                  trackId: bestTrackId,
                  centroid: [centroidX, centroidY],
                  lastSeen: nowMs
                });
              } else {
                personTrackId = '#' + nextTrackIdRef.current++;
                clientTracksRef.current.set(personTrackId, {
                  trackId: personTrackId,
                  centroid: [centroidX, centroidY],
                  lastSeen: nowMs
                });
              }
            }

            // Supporting weapon detections in current rolling window
            const supportingWeaponHits = weaponHistoryRef.current.filter(w => w.score >= 0.22);
            const isVerifiedWeapon = supportingWeaponHits.length >= 2 || weaponHistoryRef.current.some(w => w.score >= 0.40);

            let label = '';
            if (isPerson) {
              label = `PERSON ${personTrackId} ${(p.score).toFixed(2)}`;
            } else if (isCandidateWeapon) {
              if (isVerifiedWeapon) {
                label = `[VERIFIED AI WEAPON] ${p.class.toUpperCase()} ${(p.score).toFixed(2)}`;
              } else {
                label = `[POTENTIAL WEAPON] ${p.class.toUpperCase()} ${(p.score).toFixed(2)} (Verifying ${supportingWeaponHits.length}/2)`;
              }
            } else {
              label = `${p.class.toUpperCase()} ${(p.score).toFixed(2)}`;
            }

            boxes.push({
              left: Math.max(0, leftPct),
              top: Math.max(0, topPct),
              w: Math.min(100 - leftPct, wPct),
              h: Math.min(100 - topPct, hPct),
              label,
              watch: isCandidateWeapon,
              score: p.score,
              class: isCandidateWeapon ? 'weapon' : (isPerson ? 'person' : p.class)
            });
          }

          setLiveDetections(boxes);

          // FPS calculation
          fpsCountRef.current++;
          const now = performance.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            setWebcamFps(fpsCountRef.current);
            fpsCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }

          const currentActiveId = activeCamIdRef.current;
          const detectionCam = cams.find(c => c.id === currentActiveId) || (webcamActive ? webcamCam : null) || cams[0] || DEMO_CAMS[0];
          const osdMeta = {
            camName: detectionCam.name,
            location: detectionCam.location,
            geo: detectionCam.geo,
            timestamp: new Date().toLocaleString('en-GB')
          };

          const pPerson = detectedPerson;

          // Compute client person track ID if person detected
          let activePersonTrackId = '';
          if (pPerson) {
            const pCentroidX = pPerson.left + pPerson.w / 2;
            const pCentroidY = pPerson.top + pPerson.h / 2;
            clientTracksRef.current.forEach((trk) => {
              const d = Math.hypot(pCentroidX - trk.centroid[0], pCentroidY - trk.centroid[1]);
              if (d < 25.0) {
                activePersonTrackId = trk.trackId;
              }
            });
          }

          // 1. Feature 3: Temporal Weapon Verification (Requires >= 3 detections with conf >= 0.60 in 2.0s window)
          // 1. Feature 3: Temporal Weapon Verification (Requires >= 2 detections with conf >= 0.22 or strong single >= 0.40 in 2.0s window)
          const supportingWeaponHits = weaponHistoryRef.current.filter(w => w.score >= 0.22);
          const isVerifiedWeaponAlert = supportingWeaponHits.length >= 2 || weaponHistoryRef.current.some(w => w.score >= 0.40);

          if (isVerifiedWeaponAlert && armed) {
            const nowTime = Date.now();
            if (!weaponLatchedRef.current && (nowTime - lastWeaponRef.current > ALERT_COOLDOWN_MS)) {
              weaponLatchedRef.current = true;
              lastWeaponRef.current = nowTime;
              const snap = captureFrameWithBoxes(sourceEl, boxes, osdMeta);
              const latestHit = supportingWeaponHits[supportingWeaponHits.length - 1] || weaponHistoryRef.current[weaponHistoryRef.current.length - 1];
              const isFirearm = ['gun', 'pistol', 'rifle', 'firearm'].includes(latestHit.class);
              const threatTitle = isFirearm ? 'FIREARM' : 'KNIFE / EDGED WEAPON';
              const activeHits = supportingWeaponHits.length > 0 ? supportingWeaponHits : weaponHistoryRef.current;
              const meanConf = activeHits.reduce((acc, h) => acc + h.score, 0) / (activeHits.length || 1);
              const detail = `Verified AI Weapon Alert: ${threatTitle} verified across ${activeHits.length} supporting frames (mean conf: ${Math.round(meanConf * 100)}%) on ${detectionCam.name}`;

              const newAlert = mkAlert(
                'weapon',
                detectionCam.id,
                0,
                detail,
                false,
                snap,
                Math.round(meanConf * 100),
                'detector',
                detectionCam,
                activePersonTrackId || `#W-${nextTrackIdRef.current}`,
                'verified_ai',
                activeHits.length,
                new Date(activeHits[0]?.timestamp || nowTime),
                new Date()
              );
              newAlert.sev = 'high';
              addAlert(newAlert);

              // Immediate screen flash
              setIsFenceBreached(true);
              setFenceStatus('breach');
              setTimeout(() => {
                setIsFenceBreached(false);
                setFenceStatus('clear');
              }, 3000);
            }
          } else if (supportingWeaponHits.length === 0) {
            weaponLatchedRef.current = false;
          }
          // 2. Virtual Fence & Suspicious Activity Analysis (Near or Inside Fence)
          else if (pPerson) {
            const bottomY = pPerson.top + pPerson.h;
            const personAspect = pPerson.w / Math.max(pPerson.h, 1);
            const nowTime = Date.now();

            // A) INSIDE THE FENCE (BREACH / INTRUSION) — bottomY >= 72%
            if (bottomY >= 72) {
              setIsFenceBreached(true);
              setFenceStatus('breach');
              bufferTrackerRef.current.firstSeen = null;
              bufferTrackerRef.current.alerted = false;

              // Send only ONE alert while person is in the boundary line. Cooldown is 3 minutes.
              if (!intrusionLatchedRef.current && (nowTime - lastIntrusionRef.current > ALERT_COOLDOWN_MS) && armed) {
                intrusionLatchedRef.current = true;
                lastIntrusionRef.current = nowTime;
                const snap = captureFrameWithBoxes(sourceEl, boxes, osdMeta);
                const newAlert = mkAlert(
                  'intrusion',
                  detectionCam.id,
                  0,
                  `Critical Breach: Target penetrated inside protected perimeter boundary (${activePersonTrackId || 'Track'})`,
                  false,
                  snap,
                  Math.round(pPerson.score * 100),
                  'detector',
                  detectionCam,
                  activePersonTrackId || '#101',
                  'verified_ai',
                  1
                );
                newAlert.sev = 'high';
                addAlert(newAlert);
              }
            }
            // B) NEAR THE FENCE (WARNING BUFFER ZONE: 52% <= bottomY < 72%)
            else if (bottomY >= 52) {
              setFenceStatus('near_warning');
              setIsFenceBreached(false);

              // Reset intrusion latch if target moves back out of deep breach into buffer
              if (bottomY < 68) {
                intrusionLatchedRef.current = false;
              }

              // Check 1: Suspicious Crawling / Crouching infiltration posture
              const isCrawling = personAspect > 0.72 || (pPerson.h < 26 && bottomY > 58);
              if (isCrawling && !crawlLatchedRef.current && (nowTime - lastIntrusionRef.current > ALERT_COOLDOWN_MS) && armed) {
                crawlLatchedRef.current = true;
                lastIntrusionRef.current = nowTime;
                const snap = captureFrameWithBoxes(sourceEl, boxes, osdMeta);
                const newAlert = mkAlert(
                  'intrusion',
                  detectionCam.id,
                  0,
                  `Suspicious Infiltration: Low-profile crawling/crouching motion near virtual fence (${activePersonTrackId || 'Track'})`,
                  false,
                  snap,
                  Math.round(pPerson.score * 100),
                  'detector',
                  detectionCam,
                  activePersonTrackId || '#101',
                  'verified_ai',
                  1
                );
                newAlert.sev = 'high';
                addAlert(newAlert);
              }

              // Check 2: Suspicious lingering / prowling near fence (> 2.5 seconds)
              const bt = bufferTrackerRef.current;
              if (!bt.firstSeen) {
                bt.firstSeen = nowTime;
                bt.alerted = false;
              } else if (nowTime - bt.firstSeen >= 2500 && !bt.alerted && (nowTime - lastBufferLoiterRef.current > ALERT_COOLDOWN_MS) && armed) {
                bt.alerted = true;
                lastBufferLoiterRef.current = nowTime;
                const snap = captureFrameWithBoxes(sourceEl, boxes, osdMeta);
                const newAlert = mkAlert(
                  'loiter',
                  detectionCam.id,
                  0,
                  `Suspicious Activity: Subject lingering/prowling near virtual fence buffer zone (${activePersonTrackId || 'Track'})`,
                  false,
                  snap,
                  Math.round(pPerson.score * 100),
                  'detector',
                  detectionCam,
                  activePersonTrackId || '#101',
                  'verified_ai',
                  1
                );
                newAlert.sev = 'med';
                addAlert(newAlert);
              }
            }
            // C) OUTSIDE AND FAR FROM FENCE
            else {
              intrusionLatchedRef.current = false;
              crawlLatchedRef.current = false;
              bufferTrackerRef.current.firstSeen = null;
              bufferTrackerRef.current.alerted = false;
              if (nowTime - lastIntrusionRef.current > 2000) {
                setIsFenceBreached(false);
                setFenceStatus('clear');
              }
            }

            // 3. Stationary Loitering Check (> 4 seconds anywhere in frame)
            const cx = pPerson.left + pPerson.w / 2;
            const cy = pPerson.top + pPerson.h / 2;
            const lt = loiterTrackerRef.current;
            const curTime = Date.now();
            lt.lastSeen = curTime;

            if (!lt.firstSeen || !lt.center) {
              lt.firstSeen = curTime;
              lt.center = { cx, cy };
              lt.alerted = false;
            } else {
              const dist = Math.hypot(cx - lt.center.cx, cy - lt.center.cy);
              if (dist < 15) {
                if (curTime - lt.firstSeen >= 4000 && !lt.alerted && (curTime - lastLoiterRef.current > ALERT_COOLDOWN_MS) && armed) {
                  lt.alerted = true;
                  lastLoiterRef.current = curTime;
                  const snap = captureFrameWithBoxes(sourceEl, boxes, osdMeta);
                  const newAlert = mkAlert(
                    'loiter',
                    detectionCam.id,
                    0,
                    `Individual stationary 4s+ in ${detectionCam.name.split('·')[0].trim()} perimeter (Live AI Loiter)`,
                    false,
                    snap,
                    Math.round(pPerson.score * 100),
                    'detector',
                    detectionCam
                  );
                  addAlert(newAlert);
                }
              } else {
                lt.firstSeen = curTime;
                lt.center = { cx, cy };
                lt.alerted = false;
              }
            }
          } else {
            // Reset latches when person completely leaves camera
            intrusionLatchedRef.current = false;
            crawlLatchedRef.current = false;
            watchlistLatchedRef.current = false;
            bufferTrackerRef.current.firstSeen = null;
            bufferTrackerRef.current.alerted = false;
            setIsFenceBreached(false);
            setFenceStatus('clear');
            if (loiterTrackerRef.current.firstSeen && Date.now() - (loiterTrackerRef.current.lastSeen || 0) > 2000) {
              loiterTrackerRef.current.firstSeen = null;
              loiterTrackerRef.current.alerted = false;
            }
          }

        } catch (err) {
          console.error('Inference error:', err);
        } finally {
          isProcessing = false;
        }
      }, 120);
    }

    startLoop();

    return () => {
      disposed = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [webcamActive, armed, cams]);

  // Demo Trigger "K" Key Shortcut (Rotating Firearms & Weapons)
  const demoWeaponCountRef = useRef<number>(0);
  const triggerWeaponDemo = () => {
    if (!DEMO_MODE) {
      showNotice('error', 'Synthetic alerts are disabled. Set VITE_DEMO_MODE=true to enable the demo trigger.');
      return;
    }
    const targetCam = cams.find(c => c.id === activeCamId) || cams[0] || DEMO_CAMS[0];
    const demoWeapons = [
      { label: '[SIMULATION] FIREARM: HANDGUN DETECTED 0.98', detail: '[SIMULATION] CRITICAL: Firearm Detected — Handgun Drawn near boundary (Demo [K])', score: 98 },
      { label: '[SIMULATION] FIREARM: ASSAULT RIFLE 0.96', detail: '[SIMULATION] CRITICAL: Firearm Detected — Tactical Rifle Sighted at border fence (Demo [K])', score: 96 },
      { label: '[SIMULATION] WEAPON: COMBAT BLADE 0.95', detail: '[SIMULATION] CRITICAL: Weapon Detected — Concealed Knife / Blade in Hand (Demo [K])', score: 95 },
      { label: '[SIMULATION] FIREARM: HOLSTERED PISTOL 0.93', detail: '[SIMULATION] CRITICAL: Prohibited Firearm Detected — Holstered Pistol Identified (Demo [K])', score: 93 },
    ];
    const sel = demoWeapons[demoWeaponCountRef.current % demoWeapons.length];
    demoWeaponCountRef.current++;

    let boxes: DetectionBox[] = [];
    if (liveDetections.length > 0) {
      boxes = liveDetections.map(b => ({ ...b }));
      boxes.push({
        left: 44,
        top: 38,
        w: 22,
        h: 28,
        label: sel.label,
        watch: true,
        score: sel.score / 100,
        class: 'weapon'
      });
    } else {
      boxes = [{
        left: 42,
        top: 36,
        w: 22,
        h: 28,
        label: sel.label,
        watch: true,
        score: sel.score / 100,
        class: 'weapon'
      }];
    }

    let snap: string | null = null;
    const sourceEl = activeStreamRef.current || (videoRef.current && videoRef.current.readyState >= 2 ? videoRef.current : null);
    if (sourceEl) {
      snap = captureFrameWithBoxes(sourceEl, boxes, {
        camName: targetCam.name,
        location: targetCam.location,
        geo: targetCam.geo,
        timestamp: new Date().toLocaleString('en-GB')
      });
    }

    const newAlert = mkAlert(
      'weapon',
      targetCam.id,
      0,
      sel.detail,
      false,
      snap,
      sel.score,
      'simulation',
      targetCam
    );
    newAlert.sev = 'high';
    addAlert(newAlert);

    // Switch view to monitor the camera used for the demo
    goToPage('monitor');
    setActiveCamId(targetCam.id);

    // Visual breach flash
    setIsFenceBreached(true);
    setTimeout(() => {
      setIsFenceBreached(false);
    }, 3500);
  };

  // Keyboard shortcut listener for 'K' (Explicit Demo Event Injection)
  useEffect(() => {
    if (!DEMO_MODE) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        showNotice('success', '[DEMO EVENT INJECTION] Synthetic weapon alert triggered via hotkey (K) for demonstration.');
        triggerWeaponDemo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [liveDetections]);

  // Periodic simulation is an explicit demo-only feature. An offline API must
  // result in an honest empty state in normal operation.
  useEffect(() => {
    if (!DEMO_MODE || apiAvailable) return;

    const simInterval = setInterval(() => {
      if (!armed) return;
      if (Math.random() > 0.35) return;
      const simTypes = ['intrusion', 'watchlist', 'anpr', 'loiter', 'night'];
      const type = simTypes[Math.floor(Math.random() * simTypes.length)];
      const onlineCams = cams.filter(c => c.online && !isCamWebcamActive(c.id));
      if (onlineCams.length === 0) return;
      const cam = onlineCams[Math.floor(Math.random() * onlineCams.length)];

      const details: Record<string, string> = {
        intrusion: '[SIMULATION] Person crossed virtual boundary',
        watchlist: '[SIMULATION] Watchlist candidate: reference WL-0' + (10 + Math.floor(Math.random() * 90)) + ' (demo only)',
        anpr: '[SIMULATION] Plate ' + ['PB', 'RJ', 'HR', 'UP'][Math.floor(Math.random() * 4)] + '-' + (10 + Math.floor(Math.random() * 80)) + '-XX-' + (1000 + Math.floor(Math.random() * 8999)) + ' — flagged vehicle list',
        loiter: '[SIMULATION] Individual stationary 4m+ near perimeter',
        night: '[SIMULATION] Movement detected in low-light conditions',
      };

      const alert = mkAlert(type, cam.id, 0, details[type] || 'Security event detected', false, null, undefined, 'simulation', cam);
      setAlerts(prev => [alert, ...prev]);
    }, 12000);

    return () => clearInterval(simInterval);
  }, [armed, cams, apiAvailable, isCamWebcamActive]);

  useEffect(() => {
    if (!currentUser?.accessToken) return;
    const interval = setInterval(() => {
      const pingStart = performance.now();
      api.getReadiness().then(res => {
        setReadiness(res);
        setLatencyPingMs(Math.round(performance.now() - pingStart));
        setApiAvailable(true);
      }).catch(() => {
        setLatencyPingMs(null);
      });
      api.getMetrics(currentUser.accessToken).then(res => {
        setMetrics(res);
        setLastMetricsAt(Date.now());
        setApiAvailable(true);
      }).catch(() => {
        // Retain last valid metrics on transient failure
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser?.accessToken]);

  const toggleArmed = () => setArmed(prev => !prev);
  const selectCam = (id: string) => {
    setActiveCamId(id);
    setLiveDetections([]);
    setIsFenceBreached(false);
    setFenceStatus('clear');
    intrusionLatchedRef.current = false;
    crawlLatchedRef.current = false;
    watchlistLatchedRef.current = false;
    if (bufferTrackerRef.current) {
      bufferTrackerRef.current.firstSeen = null;
      bufferTrackerRef.current.alerted = false;
    }
    if (loiterTrackerRef.current) {
      loiterTrackerRef.current.firstSeen = null;
      loiterTrackerRef.current.alerted = false;
    }
  };
  const goToPage = (page: PageId) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = page === 'dashboard' ? '/' : `/${page}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ page }, '', targetPath);
      }
    }
  };
  const showNotice = (type: 'error' | 'success', message: string) => setNotice({ type, message });
  const dismissNotice = () => setNotice(null);
  const toggleMobileMenu = () => setMobileMenuOpen(prev => !prev);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const updateAlertState = (id: string, state: AlertState, assignedTo?: string, note?: string) => {
    const isReviewed = state === 'acknowledged' || state === 'resolved' || state === 'false_positive';
    setAlerts(prev => prev.map(a => a.id === id ? {
      ...a,
      state,
      reviewed: isReviewed,
      assignedTo: assignedTo !== undefined ? assignedTo : a.assignedTo,
      resolutionNote: note !== undefined ? note : a.resolutionNote,
      resolvedAt: (state === 'resolved' || state === 'false_positive') ? new Date() : a.resolvedAt
    } : a));

    if (activeLightboxAlert && activeLightboxAlert.id === id) {
      setActiveLightboxAlert(prev => prev ? {
        ...prev,
        state,
        reviewed: isReviewed,
        assignedTo: assignedTo !== undefined ? assignedTo : prev.assignedTo,
        resolutionNote: note !== undefined ? note : prev.resolutionNote,
      } : null);
    }

    // Audio feedback on alert state transition
    if (state === 'acknowledged' || state === 'resolved' || state === 'false_positive') {
      soundService.stopSiren();
      if (state === 'resolved' || state === 'false_positive') {
        soundService.playResolvedChime();
      } else {
        soundService.playAcknowledgeChime();
      }
    }

    if (activeCriticalAlert?.id === id && isReviewed) {
      setDismissedCriticalId(id);
    }

    api.updateAlert(id, {
      state,
      reviewed: isReviewed,
      assignedTo,
      resolutionNote: note
    }, currentUser?.accessToken).then(() => {
      showNotice('success', `Alert ${id} updated to ${state}.`);
    }).catch(err => {
      console.warn('Backend updateAlert error:', err.message);
      showNotice('error', 'Alert updated locally, but backend sync failed.');
    });
  };

  const markReviewed = (id: string, reason?: string) => {
    const isFP = reason?.startsWith('false_alarm');
    const newState = isFP ? 'false_positive' : 'acknowledged';
    updateAlertState(id, newState, undefined, reason || 'verified_threat');
  };

  const openLightbox = (id: string) => {
    const a = alerts.find(x => x.id === id);
    if (a) setActiveLightboxAlert(a);
  };
  const closeLightbox = () => setActiveLightboxAlert(null);
  const openFullscreen = (camId: string) => setFullscreenCamId(camId);
  const closeFullscreen = () => setFullscreenCamId(null);

  const addAlert = (alert: Alert) => {
    setAlerts(prev => [alert, ...prev]);

    // Audible alarm & desktop notification
    if (armed) {
      soundService.playAlertSound(alert.sev);
      if (alert.sev === 'high') {
        soundService.dispatchDesktopNotification(`[CRITICAL BORDER THREAT] ${alert.type.toUpperCase()}`, {
          body: `${alert.camName}: ${alert.detail}`,
          requireInteraction: true
        });
      }
    }

    // Persist to backend database & append to SHA-256 hash-chain ledger
    api.createAlert(alert, currentUser?.accessToken).catch(err => {
      console.warn('Failed to persist alert to backend:', err.message);
      showNotice('error', 'Alert shown locally, but backend persistence failed.');
    });
  };

  const escalateAlert = async (id: string, target: string, notes?: string, deadlineMinutes: number = 5) => {
    setAlerts(prev => prev.map(a => a.id === id ? {
      ...a,
      state: 'escalated' as any,
      escalationTarget: target,
      resolutionNote: notes || a.resolutionNote,
      escalationDeadline: new Date(Date.now() + deadlineMinutes * 60000)
    } : a));
    soundService.stopSiren();
    soundService.playWarningChime();

    try {
      await api.escalateAlert(id, {
        escalationTarget: target,
        deadlineMinutes,
        notes
      }, currentUser?.accessToken);
      showNotice('success', `Alert ${id} escalated to ${target.toUpperCase()} (SLA: ${deadlineMinutes}m).`);
    } catch (err: any) {
      console.warn('Escalation API error:', err.message);
      showNotice('error', 'Alert escalated locally, but backend dispatch failed.');
    }
  };

  const bulkUpdateAlerts = async (ids: string[], state: AlertState, reasonCode?: string, notes?: string) => {
    const isReviewed = state === 'acknowledged' || state === 'resolved' || state === 'false_positive';
    setAlerts(prev => prev.map(a => ids.includes(a.id) ? {
      ...a,
      state,
      reviewed: isReviewed,
      resolutionNote: notes || a.resolutionNote,
      resolvedAt: (state === 'resolved' || state === 'false_positive') ? new Date() : a.resolvedAt
    } : a));

    soundService.stopSiren();
    if (state === 'resolved') {
      soundService.playResolvedChime();
    } else {
      soundService.playAcknowledgeChime();
    }

    try {
      await api.bulkDisposition({
        alertIds: ids,
        newState: state,
        reasonCode: reasonCode || 'bulk_operator_action',
        notes
      }, currentUser?.accessToken);
      showNotice('success', `Successfully updated ${ids.length} alerts to ${state}.`);
    } catch (err: any) {
      console.warn('Bulk disposition error:', err.message);
      showNotice('error', 'Alerts updated locally, but backend sync failed.');
    }
  };

  const toggleSound = () => soundService.toggleMute();
  const setSoundVolume = (vol: number) => soundService.setVolume(vol);
  const silenceSiren = () => {
    soundService.stopSiren();
    api.silenceSiren(currentUser?.accessToken).catch(() => {});
    showNotice('success', 'Perimeter audio siren silenced.');
  };
  const testSound = (sev: 'high' | 'med' | 'low') => soundService.testSound(sev);
  const toggleDesktopNotifications = async () => {
    const next = !soundService.getDesktopNotifications();
    const granted = await soundService.setDesktopNotifications(next);
    showNotice(granted ? 'success' : 'error', granted ? 'Desktop alert notifications enabled.' : 'Desktop notifications permission not granted.');
    return granted;
  };
  const dismissCriticalBanner = () => {
    if (activeCriticalAlert) {
      setDismissedCriticalId(activeCriticalAlert.id);
    }
    soundService.stopSiren();
  };

  const toggleCamOnline = async (id: string) => {
    const prevCams = [...cams];
    setCams(prev => prev.map(c => c.id === id ? { ...c, online: !c.online } : c));
    try {
      const updated = await api.toggleCamera(id, currentUser?.accessToken);
      setCams(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
      showNotice('success', `Camera ${updated.name || id} is now ${updated.online ? 'Online' : 'Offline'}.`);
    } catch (err: any) {
      console.warn('Backend toggleCamera error:', err.message);
      setCams(prevCams);
      showNotice('error', 'Camera state change failed on server; state reverted.');
    }
  };

  const toggleCamNight = async (id: string) => {
    const prevCams = [...cams];
    setCams(prev => prev.map(c => c.id === id ? { ...c, night: !c.night } : c));
    try {
      const updated = await api.toggleNight(id, currentUser?.accessToken);
      setCams(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    } catch (err: any) {
      console.warn('Backend toggleNight error:', err.message);
      setCams(prevCams);
      showNotice('error', 'Night mode change failed on server; state reverted.');
    }
  };

  const addCamera = async (cameraData: Partial<Camera> & { name: string; rtspUrl?: string }): Promise<Camera> => {
    try {
      const newCam = await api.createCamera(cameraData, currentUser?.accessToken);
      setCams(prev => {
        const filtered = prev.filter(c => c.id !== newCam.id);
        return [...filtered, newCam];
      });
      // Generate media grant immediately for live streaming
      if (currentUser?.accessToken) {
        try {
          const result = await api.issueCameraMediaGrant(newCam.id, currentUser.accessToken);
          setStreamUrls(prev => ({
            ...prev,
            [newCam.id]: api.getStreamUrl(newCam.id, result.grant)
          }));
        } catch {
          setStreamUrls(prev => ({
            ...prev,
            [newCam.id]: api.getStreamUrl(newCam.id)
          }));
        }
      } else {
        setStreamUrls(prev => ({
          ...prev,
          [newCam.id]: api.getStreamUrl(newCam.id)
        }));
      }
      showNotice('success', `RTSP Camera registered & activated: ${newCam.name}`);
      return newCam;
    } catch (err: any) {
      showNotice('error', `Failed to register camera: ${err.message}`);
      throw err;
    }
  };

  const removeCamera = async (camId: string): Promise<void> => {
    try {
      await api.deleteCamera(camId, currentUser?.accessToken);
      setCams(prev => prev.filter(c => c.id !== camId));
      setStreamUrls(prev => {
        const copy = { ...prev };
        delete copy[camId];
        return copy;
      });
      showNotice('success', `Camera ${camId} removed.`);
    } catch (err: any) {
      showNotice('error', `Failed to remove camera: ${err.message}`);
      throw err;
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const auth = await api.login(username, password);
      setCurrentUser(auth);
      localStorage.setItem('ibvap_auth', JSON.stringify(auth));
    } catch (err: any) {
      showNotice('error', err?.message || 'Sign-in failed. Check the account and backend status.');
      throw err;
    }
  };

  const register = async (username: string, password: string, email?: string) => {
    try {
      const auth = await api.register(username, password, email);
      setCurrentUser(auth);
      localStorage.setItem('ibvap_auth', JSON.stringify(auth));
      showNotice('success', `Account ${auth.username} created and signed in.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'Account creation failed.');
      throw err;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ibvap_auth');
  };

  const switchRoleDemo = async (role: 'operator' | 'supervisor' | 'admin') => {
    if (!DEMO_MODE) {
      showNotice('error', 'Role switching is available only when VITE_DEMO_MODE=true. Sign in with your assigned account.');
      return;
    }
    const demoUser: UserAuth = { username: role, role, accessToken: '' };
    setCurrentUser(demoUser);
    localStorage.setItem('ibvap_auth', JSON.stringify(demoUser));
  };

  const openPatrolModal = (customAlert?: Alert) => {
    if (customAlert) {
      setActivePatrolAlert(customAlert);
    } else {
      const target = alerts.find(a => a.sev === 'high' && a.state !== 'resolved') || alerts[0];
      setActivePatrolAlert(target || null);
    }
  };

  const closePatrolModal = () => {
    setActivePatrolAlert(null);
  };

  return (
    <AppContext.Provider
      value={{
        cams,
        alerts,
        activeCamId,
        currentPage,
        armed,
        webcamStream,
        webcamActive,
        isHardwareWebcam,
        webcamError,
        liveDetections,
        webcamFps,
        cam1Fps,
        webcamCam,
        webcamCamId,
        isCamWebcamActive,
        isFenceBreached,
        fenceStatus,
        activeLightboxAlert,
        fullscreenCamId,
        videoRef,
        activeStreamRef,
        currentUser,
        streamUrls,
        demoMode: DEMO_MODE,
        backendConnected,
        apiAvailable,
        websocketConnected,
        metrics,
        lastMetricsAt,
        telemetryFreshness,
        readiness,
        latencyPingMs,
        notice,
        mobileMenuOpen,
        theme,
        sidebarCollapsed,
        toggleTheme,
        setTheme,
        toggleSidebar,
        activePatrolAlert,
        openPatrolModal,
        closePatrolModal,
        toggleArmed,
        selectCam,
        goToPage,
        markReviewed,
        updateAlertState,
        openLightbox,
        closeLightbox,
        openFullscreen,
        closeFullscreen,
        triggerWeaponDemo,
        addAlert,
        toggleCamOnline,
        toggleCamNight,
        login,
        register,
        logout,
        switchRoleDemo,
        startWebcam,
        stopWebcam,
        showNotice,
        dismissNotice,
        toggleMobileMenu,
        closeMobileMenu,
        soundEnabled: !soundMuted,
        toggleSound,
        soundVolume: soundVolumeState,
        setSoundVolume,
        isSirenActive,
        silenceSiren,
        testSound,
        desktopNotificationsEnabled: desktopNotifs,
        toggleDesktopNotifications,
        activeCriticalAlert,
        dismissCriticalBanner,
        escalateAlert,
        bulkUpdateAlerts,
        watchlistEntries,
        refreshWatchlist,
        addCamera,
        removeCamera
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
