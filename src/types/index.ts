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
  speedLimit: number;
  categoriesDir: boolean;
}

export interface ProbeResult {
  url: string;
  fileName: string;
  totalBytes: number;
  resumable: boolean;
  category: FileCategory;
  contentType: string;
}
