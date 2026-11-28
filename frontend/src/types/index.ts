export type AlertType = 'intrusion' | 'watchlist' | 'anpr' | 'loiter' | 'night' | 'weapon';
export type AlertSeverity = 'high' | 'med' | 'low';
export type AlertState = 'open' | 'acknowledged' | 'resolved' | 'false_positive' | 'escalated';
export type AlertProvenance = 'detector' | 'simulation';
export type PageId = 'dashboard' | 'monitor' | 'camgrid' | 'alerts' | 'vault' | 'analytics' | 'models' | 'cam-config' | 'fence-config' | 'watchlist' | 'features' | 'contact' | 'privacy' | 'terms' | 'not-found' | 'ai-investigation' | 'ai-briefing' | 'dashboard-settings';


export type CameraSourceType = 'rtsp' | 'webcam' | 'file' | 'simulation';

export interface Camera {
  id: string;
  name: string;
  location: string;
  online: boolean;
  priority: 'High' | 'Medium' | 'Low';
  fps: number;
  night: boolean;
  scene: 'fence' | 'gate' | 'night';
  geo: string;
  anchor: {
    left: number;
    top: number;
    w: number;
    h: number;
  };
  rtspUrl?: string;
  sourceType?: CameraSourceType;
  supportsWebcam?: boolean;
  activeModelVersion?: string;
  activeRuleVersion?: string;
  siteId?: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  sev: AlertSeverity;
  camId: string;
  camName: string;
  location: string;
  confidence: number;
  trackId: string;
  detail: string;
  reviewed: boolean;
  state: AlertState;
  provenance: AlertProvenance;
  ruleId?: string;
  ruleVersion?: string;
  sourceFrameTime?: Date | string;
  assignedTo?: string | null;
  resolutionNote?: string | null;
  resolvedAt?: Date | string | null;
  resolvedBy?: string | null;
  acknowledgedAt?: Date | string | null;
  escalationTarget?: string | null;
  escalationDeadline?: Date | string | null;
  escalationStatus?: 'pending' | 'acknowledged' | 'missed';
  dispositionCode?: string | null;
  dispositionReason?: string | null;
  evidenceHash?: string | null;
  verificationStatus?: 'potential' | 'verified_ai' | 'officer_reviewed';
  supportingDetections?: number;
  firstDetectedAt?: Date | string | null;
  lastDetectedAt?: Date | string | null;
  secondaryClass?: string | null;
  secondaryConfidence?: number | null;
  ts: Date;
  snapshot?: string | null;
}

export interface AlertEscalationRecord {
  id: number;
  alertId: string;
  siteId: string;
  escalationTarget: string;
  deadlineTs: string;
  status: 'pending' | 'acknowledged' | 'missed';
  createdAt: string;
}

export interface FenceRule {
  id: string;
  cameraId: string;
  name: string;
  ruleType: 'tripwire' | 'polygon_zone' | 'loiter_zone';
  direction: 'bidirectional' | 'left_to_right' | 'right_to_left' | 'entry' | 'exit';
  coordinates: number[][];
  targetClasses: string[];
  severity: AlertSeverity;
  enabled: boolean;
  cooldownSeconds: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WatchlistEntry {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  active: boolean;
  referenceOnly?: boolean;
  matcherMode?: string;
  matcherNotice?: string;
  sha256?: string | null;
  fingerprint?: string | null;
  faceCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  persisted: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface DetectionBox {
  left: number;
  top: number;
  w: number;
  h: number;
  label: string;
  watch?: boolean;
  score?: number;
  class?: string;
  friendly?: boolean;
}

export interface TypeMeta {
  label: string;
  icon: string;
  cls: string;
  sev: AlertSeverity;
}
