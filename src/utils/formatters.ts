export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0 || !isFinite(bytes)) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return '0 B';
  const sizeIdx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, sizeIdx)).toFixed(dm))} ${sizes[sizeIdx]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0 || isNaN(bytesPerSec)) return '0 B/s';
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatXdmFileName(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') {
    return `download_${Date.now()} XDM by Zihan`;
  }
  const clean = originalName.trim();
  const lastDot = clean.lastIndexOf('.');
  const base = lastDot > 0 ? clean.substring(0, lastDot) : clean;
  const ext = lastDot > 0 ? clean.substring(lastDot) : '';

  if (/xdm\s+by\s+zihan/i.test(base)) {
    return clean;
  }
  return `${base} XDM by Zihan${ext}`;
}
