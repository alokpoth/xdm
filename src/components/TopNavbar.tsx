import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Search, 
  Settings, 
  Globe, 
  Gauge, 
  Zap,
  ChevronDown,
  Crown,
  Sparkles,
  Command,
  Sun,
  Moon,
  AlertTriangle,
  X
} from 'lucide-react';
import { LicenseInfo } from '../types';

interface TopNavbarProps {
  onOpenAddModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenBrowserModal: () => void;
  onOpenLicenseModal: () => void;
  license: LicenseInfo | null;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearFinished: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  speedLimit: number;
  onSpeedLimitChange: (limit: number) => void;
  updateAvailable?: boolean;
  onOpenUpdateModal?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const TopNavbarComponent: React.FC<TopNavbarProps> = ({
  onOpenAddModal,
  onOpenSettingsModal,
  onOpenBrowserModal,
  onOpenLicenseModal,
  license,
  onPauseAll,
  onResumeAll,
  onClearFinished,
  searchQuery,
  onSearchChange,
  speedLimit,
  onSpeedLimitChange,
  updateAvailable,
  onOpenUpdateModal,
  theme,
  onToggleTheme
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeedMenu]);

  const speedOptions = [
    { label: 'Turbo (Unlimited)', value: 0 },
    { label: '50 MB/s', value: 50 * 1024 },
    { label: '20 MB/s', value: 20 * 1024 },
    { label: '10 MB/s', value: 10 * 1024 },
    { label: '5 MB/s', value: 5 * 1024 },
    { label: '2 MB/s', value: 2 * 1024 },
    { label: '1 MB/s', value: 1024 },
    { label: '512 KB/s', value: 512 }
  ];

  return (
    <header className="h-13 min-h-[52px] shrink-0 border-b border-white/[0.06] px-4 sm:px-5 flex items-center justify-between gap-3 backdrop-blur-xl z-40 select-none overflow-visible">
      {/* Left: Quick Actions */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAddModal();
          }}
          className="btn-emerald-glow flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold shrink-0 cursor-pointer select-none"
          title="Add New Download Link (Ctrl+N or Ctrl+V)"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="whitespace-nowrap tracking-tight">Add URL</span>
        </button>

        <div className="h-4 w-[1px] bg-white/[0.08] mx-0.5 sm:mx-1 shrink-0" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onResumeAll();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-white text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Resume All Downloads"
        >
          <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Resume All</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPauseAll();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-white text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Pause All Downloads"
        >
          <Pause className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Pause All</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClearFinished();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.06] hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Clear Completed Tasks from List"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Clean</span>
        </button>
      </div>

      {/* Right: Search, Speed Throttle, Browser Extension, Settings */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Search input with Command indicator */}
        <div className="relative w-36 sm:w-48 md:w-56 transition-all group">
          <Search className="w-3.5 h-3.5 text-slate-500 group-focus-within:text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" />
          <input
            type="text"
            placeholder="Search downloads..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#0b101c] theme-input border border-white/[0.08] focus:border-emerald-500/50 text-xs text-slate-200 theme-text-primary placeholder-slate-500 transition-all select-text shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px] cursor-pointer flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Speed Limiter selector */}
        <div className="relative flex-shrink-0" ref={speedMenuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSpeedMenu(!showSpeedMenu);
            }}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all active:scale-95 cursor-pointer focus:outline-none select-none ${
              speedLimit === 0 
                ? 'bg-white/[0.05] text-slate-300 border-white/[0.06] hover:border-white/[0.12]' 
                : 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
            }`}
            title="Download Speed Throttle"
          >
            {speedLimit === 0 ? (
              <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/40" />
            ) : (
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline font-mono text-[11px] font-semibold tabular-nums">
              {speedLimit === 0 ? 'Turbo' : speedLimit >= 1024 ? `${Math.round(speedLimit / 1024)}M/s` : `${speedLimit}K/s`}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showSpeedMenu ? 'rotate-180' : ''}`} />
          </button>

          {showSpeedMenu && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl liquid-modal-panel border border-white/[0.1] shadow-2xl py-2 z-50 animate-fadeIn backdrop-blur-2xl">
              <div className="px-3.5 py-1 text-[10px] uppercase font-mono tracking-wider text-slate-400 theme-text-secondary font-bold border-b border-white/[0.06] mb-1.5 flex items-center justify-between">
                <span>Speed Limiter</span>
                <span className="text-emerald-400 font-normal">Active</span>
              </div>
              {speedOptions.map((opt) => {
                const isProUser = Boolean(license?.isPro);
                const isLocked = !isProUser && opt.value > 0;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isLocked) {
                        onOpenLicenseModal();
                        setShowSpeedMenu(false);
                        return;
                      }
                      onSpeedLimitChange(opt.value);
                      setShowSpeedMenu(false);
                    }}
                    className={`w-full text-left px-3.5 py-1.5 text-xs flex items-center justify-between hover:bg-white/[0.06] transition-colors cursor-pointer focus:outline-none select-none ${
                      speedLimit === opt.value ? 'text-emerald-300 font-bold bg-emerald-500/10' : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="tabular-nums font-mono">{opt.label}</span>
                      {isLocked && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/30">
                          PRO
                        </span>
                      )}
                    </div>
                    {speedLimit === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Browser Interceptor Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBrowserModal();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] hover:border-white/[0.12] text-xs font-medium text-slate-300 hover:text-white transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Browser Extension Integration (Chrome, Edge, Firefox, Brave)"
        >
          <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="hidden lg:inline text-[11px] whitespace-nowrap">Extension</span>
        </button>

        {/* Update Available Badge */}
        {updateAvailable && onOpenUpdateModal && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenUpdateModal();
            }}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-400/50 text-emerald-300 text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer focus:outline-none animate-bounce"
            title="A new version of XDM Turbo is available! Click to update."
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap">Update</span>
          </button>
        )}

        {/* License PRO Status / Banned / Upgrade Button */}
        {license?.isBanned || license?.status === 'banned' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseModal();
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 text-xs font-bold transition-all shadow-md shadow-rose-500/20 active:scale-95 cursor-pointer focus:outline-none select-none"
            title="Hardware Locked due to Security / Tamper Detection"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="font-mono text-[11px] font-extrabold tracking-wide">BANNED</span>
          </button>
        ) : (license?.isPro || license?.isAdmin || license?.status === 'pro' || license?.status === 'grace' || license?.edition === 'pro') ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseModal();
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all shadow-sm shadow-emerald-500/20 active:scale-95 cursor-pointer focus:outline-none select-none"
            title={license?.expiresAt ? `PRO Active (Expires: ${new Date(license.expiresAt).toLocaleDateString()})` : "PRO Lifetime Active (64 Turbo Streams & 4K Video Unlocked)"}
          >
            <Crown className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="font-mono text-[11px] font-extrabold tracking-wide">
              {license?.expiresAt ? (() => {
                const days = Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
                return `PRO (${days}d)`;
              })() : 'PRO'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseModal();
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer focus:outline-none select-none animate-pulse"
            title="Activate XDM Turbo PRO (64 streams & 4K video)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap">Upgrade to PRO</span>
          </button>
        )}

        {/* Theme Toggle Button (Light & Dark Liquid Glass Mode) */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-8.5 h-8.5 flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] hover:border-white/[0.12] text-slate-400 hover:text-amber-300 transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title={theme === 'dark' ? 'Switch to Light Glass Theme' : 'Switch to Dark Liquid Glass Theme'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Moon className="w-4 h-4 text-sky-400 shrink-0" />
          )}
        </button>

        {/* Settings Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettingsModal();
          }}
          className="w-8.5 h-8.5 flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] hover:border-white/[0.12] text-slate-400 hover:text-white transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Settings & Preferences"
        >
          <Settings className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </header>
  );
};

export const TopNavbar = React.memo(TopNavbarComponent);
