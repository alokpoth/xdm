import React, { useState, useEffect } from 'react';
import { X, Globe, Check, Zap, ExternalLink, ShieldCheck } from 'lucide-react';

interface BrowserIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrowserIntegrationModal: React.FC<BrowserIntegrationModalProps> = ({
  isOpen,
  onClose
}) => {
  const [autoInstalled, setAutoInstalled] = useState(false);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-lg rounded-3xl liquid-modal-panel border shadow-2xl overflow-hidden backdrop-blur-2xl">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-500/25 to-blue-400/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-sm">
              <Globe className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white theme-text-primary tracking-tight">Browser Integration</h2>
              <p className="text-[11px] text-slate-400 theme-text-secondary">Automatic Extension & 1-Click Video Grabber</p>
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
        <div className="p-6 space-y-4 text-xs">
          {/* Main Extension Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                <Zap className="w-4 h-4" />
                <span>Automatic Browser Integration</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                Active
              </span>
            </div>

            <p className="text-slate-300 theme-text-secondary leading-relaxed text-[11px]">
              XDM Turbo automatically intercepts downloads in Google Chrome, Microsoft Edge, and Brave Browser. Simply click any download link on the web to accelerate it.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleAutoInstall}
                className="btn-emerald-glow px-4 py-2 rounded-xl text-xs font-bold text-black transition-all flex items-center space-x-1.5 cursor-pointer shadow-md active:scale-95"
              >
                {autoInstalled ? <Check className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{autoInstalled ? 'Integration Active!' : 'Sync Browser Integration'}</span>
              </button>

              <button
                onClick={() => handleLaunchBrowser('chrome')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white font-medium text-xs cursor-pointer active:scale-95"
              >
                Open Chrome
              </button>

              <button
                onClick={() => handleLaunchBrowser('edge')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white font-medium text-xs cursor-pointer active:scale-95"
              >
                Open Edge
              </button>

              <button
                onClick={() => handleLaunchBrowser('brave')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white font-medium text-xs cursor-pointer active:scale-95"
              >
                Open Brave
              </button>
            </div>
          </div>

          {/* Video Grabber Feature Card */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
            <h4 className="text-xs font-bold text-slate-200 theme-text-primary flex items-center space-x-1.5">
              <span>🎬 4K & Ultra HD Video Grabber</span>
            </h4>
            <p className="text-slate-400 theme-text-secondary text-[11px] leading-relaxed">
              When playing videos on YouTube, Facebook, Vimeo, or web video players, a floating <strong>Download Video</strong> button appears above the player so you can save videos in up to 4K resolution with 1 click.
            </p>
          </div>

          {/* Seamless Experience Info */}
          <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-300 flex items-center space-x-2 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Fully secured, ad-free, and approved for all Chromium browsers.</span>
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
