import React, { useState, useEffect } from 'react';
import { X, Globe, Check, Zap, ExternalLink, ShieldCheck, Film, FolderOpen, ArrowRight, ToggleRight, Sparkles } from 'lucide-react';

interface BrowserIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrowserIntegrationModal: React.FC<BrowserIntegrationModalProps> = ({
  isOpen,
  onClose
}) => {
  const [autoInstalled, setAutoInstalled] = useState(false);
  const [folderOpened, setFolderOpened] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const handleAutoInstall = async () => {
    try {
      const res = await fetch('/api/extension/auto-install', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAutoInstalled(true);
        setTimeout(() => setAutoInstalled(false), 3000);
      }
    } catch (e) {}
  };

  const handleOpenFolder = async () => {
    try {
      const res = await fetch('/api/extension/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFolderOpened(true);
        setTimeout(() => setFolderOpened(false), 3000);
      }
    } catch (e) {}
  };

  const handleOpenExtensionsPage = async (browser: string) => {
    try {
      await fetch('/api/extension/open-extensions-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser })
      });
    } catch (e) {}
  };

  const handleLaunchBrowser = async (browser: string) => {
    await fetch('/api/extension/launch-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser })
    });
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-2xl rounded-3xl liquid-modal-panel border shadow-2xl overflow-hidden backdrop-blur-2xl">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-500/25 to-blue-400/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-sm">
              <Globe className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white theme-text-primary tracking-tight">Browser Extension Setup</h2>
              <p className="text-[11px] text-slate-400 theme-text-secondary">Brave, Google Chrome &amp; Microsoft Edge Integration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white theme-text-secondary hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Step-by-Step Installation Guide */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                <Zap className="w-4 h-4" />
                <span>Quick 2-Step Browser Activation</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                1-Time Setup
              </span>
            </div>

            <p className="text-slate-300 theme-text-secondary leading-relaxed text-[11px]">
              Modern Chromium browsers (Brave, Chrome, Edge) block silent off-store extensions by default. Follow these two quick steps to activate XDM Turbo:
            </p>

            <div className="space-y-2.5 text-[11px]">
              <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 font-mono mt-0.5">
                  1
                </span>
                <div className="space-y-1">
                  <span className="font-bold text-slate-200 theme-text-primary">Turn ON Developer Mode in Browser</span>
                  <p className="text-slate-400 text-[10px] leading-relaxed">
                    Open your browser extensions page (e.g. <strong>brave://extensions</strong>) and toggle <strong>Developer mode</strong> in the top right corner to ON.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 font-mono mt-0.5">
                  2
                </span>
                <div className="space-y-1">
                  <span className="font-bold text-slate-200 theme-text-primary">Load the XDM Turbo Extension</span>
                  <p className="text-slate-400 text-[10px] leading-relaxed">
                    Click <strong>Open Extension Folder</strong> below, then simply drag and drop the folder into your browser window (or click <strong>Load unpacked</strong> and select it).
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <button
                onClick={handleOpenFolder}
                className="btn-emerald-glow px-4 py-2 rounded-xl text-xs font-bold text-black transition-all flex items-center space-x-1.5 cursor-pointer shadow-md active:scale-95"
              >
                {folderOpened ? <Check className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
                <span>{folderOpened ? 'Folder Opened!' : 'Open Extension Folder'}</span>
              </button>

              <button
                onClick={() => handleOpenExtensionsPage('brave')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white font-medium text-xs cursor-pointer active:scale-95 flex items-center space-x-1.5"
              >
                <ExternalLink className="w-3 h-3 text-amber-400" />
                <span>Open brave://extensions</span>
              </button>

              <button
                onClick={() => handleOpenExtensionsPage('chrome')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white font-medium text-xs cursor-pointer active:scale-95 flex items-center space-x-1.5"
              >
                <ExternalLink className="w-3 h-3 text-sky-400" />
                <span>Open chrome://extensions</span>
              </button>
            </div>
          </div>

          {/* Background Registry Sync */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-200 theme-text-primary flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Windows Registry Integration</span>
              </h4>
              <p className="text-slate-400 text-[10px]">Writes Chromium policies for Chrome, Brave, and Edge.</p>
            </div>
            <button
              onClick={handleAutoInstall}
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white text-xs font-semibold cursor-pointer active:scale-95 shrink-0"
            >
              {autoInstalled ? 'Synced!' : 'Sync Registry'}
            </button>
          </div>

          {/* Video Grabber Feature Card */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
            <h4 className="text-xs font-bold text-slate-200 theme-text-primary flex items-center space-x-2">
              <Film className="w-3.5 h-3.5 text-rose-400" />
              <span>4K &amp; Ultra HD Video Grabber</span>
            </h4>
            <p className="text-slate-400 theme-text-secondary text-[11px] leading-relaxed">
              When playing videos on YouTube, Facebook, Vimeo, or web video players, a floating <strong>Download Video</strong> button appears above the player so you can save videos in up to 4K resolution with 1 click.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.08] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
