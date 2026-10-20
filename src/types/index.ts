export type DownloadStatus = 
  | 'queued' 
  | 'probing' 
  | 'downloading' 
  | 'paused' 
  | 'completed' 
  | 'error' 
  | 'cancelled';

export type FileCategory = 
  | 'all' 
  | 'compressed' 
  | 'video' 
  | 'audio' 
  | 'documents' 
  | 'programs' 
  | 'others';

export interface Segment {
  id: number;
  start: number;
  end: number;
  current: number;
  downloaded: number;
  speed: number;
  status: 'pending' | 'connecting' | 'downloading' | 'completed' | 'error' | 'retrying' | 'paused';
  progress: number;
}

export interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'warn' | 'error' | 'success';
}

export interface SpeedDataPoint {
  time: number;
  speed: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  originalUrl: string;
  fileName: string;
  filePath: string;
  saveDir: string;
  totalBytes: number;
  downloadedBytes: number;
  progress: number;
  status: DownloadStatus;
  speed: number;
  peakSpeed: number;
  averageSpeed: number;
  speedHistory: SpeedDataPoint[];
  eta: number;
  connections: number;
  resumable: boolean;
  category: FileCategory;
  contentType: string;
  createdAt: number;
  completedAt: number | null;
  error?: string | null;
  segments: Segment[];
  logs: LogEntry[];
}

export interface GlobalStats {
  totalSpeed: number;
  activeDownloads: number;
  totalDownloads: number;
  totalDownloaded: number;
  totalSize: number;
}

export interface Settings {
  defaultSaveDir: string;
  maxConcurrentDownloads: number;
  defaultConnections: number;
  autoStart: boolean;
  soundNotification: boolean;
  speedLimit: number; // in KB/s (0 = unlimited)
  categoriesDir: boolean;
  clipboardMonitoring?: boolean;
  windowsNotifications?: boolean;
  schedulerEnabled?: boolean;
  scheduleStartTime?: string;
  scheduleStopTime?: string;
  shutdownOnCompletion?: boolean;
}

export interface ProbeResult {
  url: string;
  fileName: string;
  totalBytes: number;
  resumable: boolean;
  category: FileCategory;
  contentType: string;
  isVideo?: boolean;
  videoInfo?: {
    id: string;
    title: string;
    thumbnail?: string;
    durationString?: string;
    uploader?: string;
    formats?: Array<{
      id: string;
      label: string;
      resolution: string;
      ext: string;
      hasAudio: boolean;
      hasVideo: boolean;
    }>;
  };
}

export interface LicenseInfo {
  isPro: boolean;
  isAdmin?: boolean;
  edition?: string;
  isBanned?: boolean;
  banReason?: string | null;
  status: 'free' | 'pro' | 'admin' | 'expired' | 'trial' | 'grace_expired' | 'banned';
  maskedKey: string;
  fullKey: string;
  customerName: string;
  customerEmail?: string;
  deviceId?: string;
  deviceName?: string;
  hardwareId?: string;
  activatedAt: number | null;
  expiresAt: number | null;
  graceUntil?: number | null;
  offlineGraceRemainingHours?: number;
  serverUrl?: string;
  lastOnlineCheck?: number | null;
  checkIntervalSeconds?: number;
  issuer: string;
  error?: string;
}

