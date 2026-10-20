import React from 'react';
import { X, Sparkles, Download, ArrowUpRight, CheckCircle2 } from 'lucide-react';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseName?: string;
    releaseNotes?: string;
    downloadUrl?: string;
  } | null;
  onDownloadUpdate: (url: string) => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
  onDownloadUpdate
}) => {
  if (!isOpen || !updateInfo) return null;

  const handleOpenReleaseUrl = () => {
    const targetUrl = updateInfo.downloadUrl || 'https://gitlab.com/zihanfakir/xdm/-/releases';
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(targetUrl);
    } else {
      window.open(targetUrl, '_blank');
    }
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-xl rounded-3xl liquid-modal-panel border border-white/[0.09] shadow-2xl overflow-hidden flex flex-col backdrop-blur-2xl">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white theme-text-primary flex items-center space-x-2 tracking-tight">
                <span>Update Available!</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shadow-sm">
                  v{updateInfo.latestVersion}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 theme-text-secondary font-mono">Current: v{updateInfo.currentVersion}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-slate-300 theme-text-secondary">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2 shadow-sm">
            <h3 className="font-bold text-white theme-text-primary text-xs tracking-tight">{updateInfo.releaseName || `XDM Turbo v${updateInfo.latestVersion}`}</h3>
            {updateInfo.releaseNotes ? (
              <div className="text-[11px] text-slate-300 theme-text-secondary whitespace-pre-line max-h-40 overflow-y-auto custom-scrollbar font-mono leading-relaxed">
                {updateInfo.releaseNotes}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 theme-text-secondary leading-relaxed">
                A new performance and security update is ready for XDM Turbo. Update now to enjoy improved download speeds and the latest features.
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Fast installer with automatic in-place upgrade.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/20 border-t border-white/[0.06] flex items-center justify-end space-x-2.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer focus:outline-none active:scale-95 shadow-sm"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => {
              if (updateInfo.downloadUrl) {
                onDownloadUpdate(updateInfo.downloadUrl);
              } else {
                handleOpenReleaseUrl();
              }
              onClose();
            }}
            className="btn-emerald-glow px-4.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer focus:outline-none active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Update</span>
          </button>
        </div>
      </div>
    </div>
  );
};
