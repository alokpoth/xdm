import React from 'react';
import { 
  Download, 
  CheckCircle2, 
  PauseCircle, 
  AlertCircle, 
  Layers, 
  Archive, 
  Film, 
  Music, 
  FileText, 
  Cpu, 
  FolderArchive,
  Activity,
  ArrowDown,
  Crown,
  Sparkles,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { DownloadItem, FileCategory, DownloadStatus, GlobalStats, LicenseInfo } from '../types';
import { formatBytes, formatSpeed } from '../utils/formatters';

interface SidebarProps {
  currentFilter: { type: 'status' | 'category'; value: string };
  onSelectFilter: (filter: { type: 'status' | 'category'; value: string }) => void;
  downloads: DownloadItem[];
  stats: GlobalStats;
  license: LicenseInfo | null;
  onOpenLicenseModal: () => void;
}

const SidebarComponent: React.FC<SidebarProps> = ({
  currentFilter,
  onSelectFilter,
  downloads,
  stats,
  license,
  onOpenLicenseModal
}) => {
  // Compute counts
  const counts = {
    all: downloads.length,
    downloading: downloads.filter(d => d.status === 'downloading' || d.status === 'probing').length,
    completed: downloads.filter(d => d.status === 'completed').length,
    paused: downloads.filter(d => d.status === 'paused' || d.status === 'queued').length,
    error: downloads.filter(d => d.status === 'error').length,
    // Categories
    compressed: downloads.filter(d => d.category === 'compressed').length,
    video: downloads.filter(d => d.category === 'video').length,
    audio: downloads.filter(d => d.category === 'audio').length,
    documents: downloads.filter(d => d.category === 'documents').length,
    programs: downloads.filter(d => d.category === 'programs').length,
    others: downloads.filter(d => d.category === 'others').length,
  };

  const statusItems = [
    { 
      id: 'all', 
      label: 'All Downloads', 
      icon: Layers, 
      count: counts.all, 
      color: 'text-slate-400',
      activeBg: 'bg-white/[0.08] text-white theme-text-primary font-medium border-transparent',
      activeText: 'text-white theme-text-primary',
      badgeActive: 'bg-white/15 text-white font-semibold'
    },
    { 
      id: 'downloading', 
      label: 'Downloading', 
      icon: Download, 
      count: counts.downloading, 
      color: 'text-emerald-400', 
      activeGlow: false,
      activeBg: 'bg-emerald-500/12 text-emerald-400 font-medium border-transparent',
      activeText: 'text-emerald-400',
      badgeActive: 'bg-emerald-500/20 text-emerald-300 font-semibold'
    },
    { 
      id: 'completed', 
      label: 'Finished', 
      icon: CheckCircle2, 
      count: counts.completed, 
      color: 'text-teal-400',
      activeBg: 'bg-teal-500/12 text-teal-300 font-medium border-transparent',
      activeText: 'text-teal-300',
      badgeActive: 'bg-teal-500/20 text-teal-300 font-semibold'
    },
    { 
      id: 'paused', 
      label: 'Paused / Queue', 
      icon: PauseCircle, 
      count: counts.paused, 
      color: 'text-amber-400',
      activeBg: 'bg-amber-500/12 text-amber-300 font-medium border-transparent',
      activeText: 'text-amber-300',
      badgeActive: 'bg-amber-500/20 text-amber-300 font-semibold'
    },
    { 
      id: 'error', 
      label: 'Failed', 
      icon: AlertCircle, 
      count: counts.error, 
      color: 'text-rose-400',
      activeBg: 'bg-rose-500/12 text-rose-300 font-medium border-transparent',
      activeText: 'text-rose-300',
      badgeActive: 'bg-rose-500/20 text-rose-300 font-semibold'
    },
  ];

  const categoryItems = [
    { id: 'compressed', label: 'Compressed', icon: Archive, count: counts.compressed },
    { id: 'video', label: 'Video', icon: Film, count: counts.video },
    { id: 'audio', label: 'Audio', icon: Music, count: counts.audio },
    { id: 'documents', label: 'Documents', icon: FileText, count: counts.documents },
    { id: 'programs', label: 'Programs', icon: Cpu, count: counts.programs },
    { id: 'others', label: 'Others', icon: FolderArchive, count: counts.others },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#070b13]/95 border-r border-white/[0.06] flex flex-col justify-between select-none h-full p-3.5 backdrop-blur-2xl overflow-hidden relative">
      <div className="overflow-y-auto flex-1 min-h-0 space-y-5 pr-1">
        {/* Status navigation */}
        <div>
          <div className="flex items-center space-x-1.5 px-3 mb-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
            <span>Task Manager</span>
          </div>
          <div className="space-y-1">
            {statusItems.map((item) => {
              const Icon = item.icon;
              const isSelected = currentFilter.type === 'status' && currentFilter.value === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectFilter({ type: 'status', value: item.id })}
                  className={`w-full relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer focus:outline-none select-none border ${
                    isSelected
                      ? item.activeBg
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  )}
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? item.activeText : item.color}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span className={`text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full shrink-0 ${
                      isSelected 
                        ? item.badgeActive 
                        : item.activeGlow 
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-white/[0.06] text-slate-400 border border-white/[0.04]'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories navigation */}
        <div>
          <div className="flex items-center space-x-1.5 px-3 mb-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
            <span>Categories</span>
          </div>
          <div className="space-y-1">
            {categoryItems.map((item) => {
              const Icon = item.icon;
              const isSelected = currentFilter.type === 'category' && currentFilter.value === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectFilter({ type: 'category', value: item.id })}
                  className={`w-full relative flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer focus:outline-none select-none border ${
                    isSelected
                      ? 'bg-white/[0.08] text-white font-semibold border-white/[0.12] shadow-sm'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3.5 rounded-full bg-slate-400 dark:bg-slate-300" />
                  )}
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span className={`text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md shrink-0 ${
                      isSelected
                        ? 'bg-white/20 text-white font-bold'
                        : 'bg-white/[0.05] text-slate-400'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* License Status Card */}
      {(license?.isBanned || license?.status === 'banned') ? (
        <div 
          onClick={onOpenLicenseModal}
          className="shrink-0 mt-3 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 hover:border-rose-400/60 shadow-lg cursor-pointer transition-all duration-200 select-none group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-extrabold text-rose-300">Device Locked</span>
            </div>
            <span className="text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-md border border-rose-500/40">
              BANNED
            </span>
          </div>
          <div className="text-[10px] text-rose-300/80 font-mono mt-1.5 flex items-center justify-between">
            <span>Tamper Detected</span>
            <span className="text-rose-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">Info &rarr;</span>
          </div>
        </div>
      ) : (license?.isPro || license?.isAdmin || license?.status === 'pro' || license?.status === 'grace' || license?.edition === 'pro') ? (
        <div 
          onClick={onOpenLicenseModal}
          className="theme-sidebar-pro-card shrink-0 mt-3 p-3 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#0d1525] to-[#0a0f1a] border border-emerald-500/30 shadow-lg shadow-emerald-950/20 cursor-pointer hover:border-emerald-500/60 transition-all duration-200 select-none group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Crown className="w-4 h-4 text-emerald-400 fill-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="theme-sidebar-pro-title text-xs font-extrabold text-white tracking-wide">
                {license?.expiresAt ? (() => {
                  const days = Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
                  return `PRO (${days} Days)`;
                })() : 'PRO Lifetime'}
              </span>
            </div>
            <span className="theme-sidebar-pro-badge text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
              64 STREAMS
            </span>
          </div>
          <div className="theme-sidebar-pro-sub text-[10px] text-slate-400 font-mono mt-1.5 flex items-center justify-between">
            <span>{license?.expiresAt ? `Expires: ${new Date(license.expiresAt).toLocaleDateString()}` : 'Hardware Locked'}</span>
            <span className="text-emerald-500 dark:text-emerald-400 font-bold flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Active</span>
            </span>
          </div>
        </div>
      ) : (
        <div 
          onClick={onOpenLicenseModal}
          className="shrink-0 mt-3 p-3 rounded-2xl liquid-glass-card border border-white/[0.08] hover:border-emerald-500/30 shadow-sm cursor-pointer transition-all duration-150 select-none group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-200 theme-text-primary">Free Edition</span>
            </div>
            <span className="text-[9px] font-mono font-medium bg-white/[0.06] text-slate-400 theme-text-secondary px-1.5 py-0.5 rounded border border-white/[0.06]">
              4 STREAMS
            </span>
          </div>
          <div className="text-[10px] text-slate-400 theme-text-secondary mt-1.5 flex items-center justify-between">
            <span>Standard Speed</span>
            <span className="text-emerald-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center">Upgrade &rarr;</span>
          </div>
        </div>
      )}

      {/* Network Activity Monitor */}
      <div className="shrink-0 mt-3 rounded-2xl p-3.5 liquid-glass-card border border-white/[0.08] shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5">
            <Activity className={`w-3.5 h-3.5 ${stats.totalSpeed > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} shrink-0`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 theme-text-secondary">
              Network Speed
            </span>
          </div>
          {stats.totalSpeed > 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
              <ArrowDown className="w-2.5 h-2.5 mr-0.5" />
              Active
            </span>
          ) : (
            <span className="text-[9px] text-slate-500 font-mono">Idle</span>
          )}
        </div>

        <div className="flex items-baseline space-x-1 mb-2">
          <span className="text-xl font-bold font-mono tabular-nums tracking-tight text-white theme-text-primary">
            {formatSpeed(stats.totalSpeed).split('/')[0]}
          </span>
          <span className="text-xs text-slate-400 theme-text-secondary font-mono">/s</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 theme-text-secondary border-t border-white/[0.06] pt-2 mt-1">
          <span>Active: <strong className="text-white theme-text-primary font-semibold">{stats.activeDownloads}</strong></span>
          <span>Total: <strong className="text-slate-300 theme-text-primary font-semibold">{formatBytes(stats.totalDownloaded)}</strong></span>
        </div>
      </div>

      {/* Brand & Author Info */}
      <div className="shrink-0 mt-3 px-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>XDM Turbo v1.0.11</span>
        <a
          href="https://xdm.zihan.xyz"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
              (window as any).electronAPI.openExternal('https://xdm.zihan.xyz');
            } else {
              window.open('https://xdm.zihan.xyz', '_blank');
            }
          }}
          className="text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer flex items-center space-x-1"
        >
          <span>xdm.zihan.xyz</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
