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
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 w-full"
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

  // Sort segments by start byte offset so segments physically always stay from left to right
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  return (
    <div className={`w-full ${height} bg-slate-900/95 rounded-full overflow-hidden relative border border-slate-800`}>
      {sorted.map((seg) => {
        const segTotal = Math.max(1, seg.end - seg.start + 1);
        const segDownloaded = Math.max(0, Math.min(segTotal, seg.current - seg.start));
        const leftPct = (seg.start / totalBytes) * 100;
        const totalWidthPct = (segTotal / totalBytes) * 100;
        const downloadedPct = (segDownloaded / totalBytes) * 100;

        return (
          <React.Fragment key={seg.id}>
            {/* Thread slice divider */}
            <div 
              className="absolute top-0 bottom-0 border-r border-slate-800/80 pointer-events-none z-10" 
              style={{ left: `${leftPct + totalWidthPct}%` }}
            />
            {/* Thread downloaded fill */}
            <div
              className={`absolute top-0 bottom-0 ${
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
              style={{
                left: `${leftPct}%`,
                width: `${seg.status === 'completed' ? totalWidthPct : downloadedPct}%`
              }}
              title={
                showTooltip
                  ? `Thread #${seg.id + 1}: ${formatBytes(segDownloaded)} / ${formatBytes(segTotal)} (${((segDownloaded / segTotal) * 100).toFixed(0)}%) | ${formatSpeed(seg.speed)}`
                  : undefined
              }
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
