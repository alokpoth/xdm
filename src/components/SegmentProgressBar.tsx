import React from 'react';
import { Segment } from '../types';
import { formatBytes, formatSpeed } from '../utils/formatters';

interface SegmentProgressBarProps {
  segments: Segment[];
  totalBytes: number;
  overallProgress: number;
  status: string;
  height?: string;
  showTooltip?: boolean;
}

export const SegmentProgressBar: React.FC<SegmentProgressBarProps> = ({
  segments,
  totalBytes,
  overallProgress,
  status,
  height = 'h-2.5',
  showTooltip = true
}) => {
  // If completed, show solid 100% finished bar
  if (status === 'completed') {
    return (
      <div className={`w-full ${height} bg-slate-800/80 rounded-full overflow-hidden relative`}>
        <div 
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 w-full"
        />
      </div>
    );
  }

  // If no segments or not segmented yet, show smooth progress bar
  if (!segments || segments.length === 0 || totalBytes <= 0) {
    return (
      <div className={`w-full ${height} bg-slate-800/80 rounded-full overflow-hidden relative`}>
        <div 
          className={`h-full transition-all duration-300 rounded-full ${
            status === 'paused'
              ? 'bg-amber-500'
              : status === 'error'
              ? 'bg-rose-500'
              : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
        />
      </div>
    );
  }

  return (
    <div className={`w-full ${height} bg-slate-800/90 rounded-full overflow-hidden flex gap-[1px] p-[1px] relative`}>
      {segments.map((seg) => {
        const segTotal = Math.max(1, seg.end - seg.start + 1);
        const segDownloaded = Math.max(0, seg.current - seg.start);
        const segProgress = Math.min(100, Math.max(0, (segDownloaded / segTotal) * 100));
        const widthPct = Math.max(1, (segTotal / totalBytes) * 100);

        return (
          <div
            key={seg.id}
            className="h-full bg-slate-900/90 relative group overflow-hidden"
            style={{ width: `${widthPct}%` }}
            title={
              showTooltip
                ? `Thread #${seg.id + 1}: ${formatBytes(segDownloaded)} / ${formatBytes(segTotal)} (${segProgress.toFixed(0)}%) | ${formatSpeed(seg.speed)}`
                : undefined
            }
          >
            {/* Segment Fill */}
            <div
              className={`h-full transition-all duration-200 ${
                seg.status === 'completed'
                  ? 'bg-emerald-500'
                  : seg.status === 'downloading'
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : seg.status === 'connecting'
                  ? 'bg-blue-400 animate-pulse'
                  : seg.status === 'error' || seg.status === 'retrying'
                  ? 'bg-rose-400'
                  : 'bg-amber-400/80'
              }`}
              style={{ width: `${segProgress}%` }}
            />
          </div>
        );
      })}
    </div>
  );
};
