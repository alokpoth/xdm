import React, { useState, useEffect } from 'react';
import { 
  X, 
  KeyRound, 
  ShieldCheck, 
  Check, 
  Copy, 
  ExternalLink, 
  Zap, 
  Cpu, 
  Sparkles, 
  Lock, 
  AlertTriangle,
  RefreshCw,
  Crown
} from 'lucide-react';
import { LicenseInfo } from '../types';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseInfo | null;
  onActivate: (key: string, name?: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  onDeactivate: () => Promise<{ success: boolean; error?: string }>;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  license,
  onActivate,
  onDeactivate
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [copiedHwId, setCopiedHwId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyHwId = () => {
    if (!license?.hardwareId) return;
    navigator.clipboard.writeText(license.hardwareId);
    setCopiedHwId(true);
    setTimeout(() => setCopiedHwId(false), 2000);
  };

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setKeyInput(text.trim().toUpperCase());
    } catch (e) {}
  };

  const handleSubmitActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setFeedback({ type: 'error', message: 'Please enter your license key' });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await onActivate(keyInput.trim());
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'XDM Turbo PRO Activated Successfully!' });
        setKeyInput('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to activate key' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error during activation' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateClick = async () => {
    if (!window.confirm('Are you sure you want to deactivate your PRO license on this device?')) {
      return;
    }
    setLoading(true);
    try {
      await onDeactivate();
      setFeedback({ type: 'success', message: 'License deactivated on this device.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to deactivate' });
    } finally {
      setLoading(false);
    }
  };

  const openWebsite = () => {
    const url = 'https://xdm.zihan.uk';
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const isPro = Boolean(license?.isPro);

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#0d121e] border border-slate-800 shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-[#101726] to-slate-900 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              isPro 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/20' 
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}>
              {isPro ? <Crown className="w-4 h-4 fill-emerald-400" /> : <KeyRound className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="font-bold text-sm text-white flex items-center space-x-2">
                <span>{isPro ? 'XDM Turbo PRO Lifetime' : 'XDM Turbo License & Activation'}</span>
                {isPro && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    ACTIVE
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isPro ? 'Bound to 1 device • 1-minute cryptographic integrity' : '1 Key = 1 Device hardware lock'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Feedback banner */}
          {feedback && (
            <div className={`p-3 rounded-xl border flex items-center space-x-2.5 ${
              feedback.type === 'success' 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}>
              {feedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="text-xs font-medium">{feedback.message}</span>
            </div>
          )}

          {/* Active Status Display or Activation Form */}
          {isPro ? (
            <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-slate-100 text-sm">PRO License Activated</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  Lifetime Access
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-slate-500 font-mono text-[10px]">ACTIVE KEY</div>
                  <div className="font-mono text-slate-200 font-bold truncate mt-0.5">
                    {license?.maskedKey || 'XDM-PRO-****'}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="text-slate-500 font-mono text-[10px]">CHECK INTERVAL</div>
                  <div className="font-mono text-emerald-400 font-semibold flex items-center space-x-1 mt-0.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Every 60 Seconds</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hardware-Locked to this Windows PC</span>
                </div>
                <button
                  type="button"
                  onClick={handleDeactivateClick}
                  disabled={loading}
                  className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                >
                  Deactivate License
                </button>
              </div>
            </div>
          ) : (
            /* Free Tier Activation Box */
            <form onSubmit={handleSubmitActivate} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                  Enter License Key
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="XDM-PRO-XXXX-XXXX-XXXX-XXXX"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-emerald-500 focus:outline-none text-white font-mono text-xs placeholder-slate-600 tracking-wider"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasteKey}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all shrink-0 cursor-pointer"
                    title="Paste from clipboard"
                  >
                    Paste
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{loading ? 'Verifying...' : 'Activate PRO'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Hardware Device Fingerprint Card */}
          <div className="rounded-xl p-3 bg-slate-900/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>Device Fingerprint (1-PC Lock ID)</span>
              </span>
              <button
                type="button"
                onClick={handleCopyHwId}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-all cursor-pointer"
              >
                {copiedHwId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHwId ? 'Copied!' : 'Copy ID'}</span>
              </button>
            </div>
            <div className="font-mono text-xs text-slate-200 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 select-all">
              {license?.hardwareId || 'Generating...'}
            </div>
            <p className="text-[10px] text-slate-500">
              Each key locks permanently to your Windows hardware profile. Re-checked automatically every 1 minute.
            </p>
          </div>

          {/* Features Comparison */}
          <div className="rounded-xl p-3 bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Free vs PRO Features
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800/50 space-y-1">
                <div className="font-semibold text-slate-400">Free Tier</div>
                <div className="text-slate-500">• 8 Parallel Connections</div>
                <div className="text-slate-500">• Standard speed buffer</div>
                <div className="text-slate-500">• Basic video grabber</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 space-y-1">
                <div className="font-semibold text-emerald-400 flex items-center space-x-1">
                  <Zap className="w-3 h-3" />
                  <span>PRO Tier</span>
                </div>
                <div className="text-emerald-300/80">• 32-64 Parallel Streams</div>
                <div className="text-emerald-300/80">• 100% Bandwidth Saturation</div>
                <div className="text-emerald-300/80">• 4K 60fps & Audio Merge</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={openWebsite}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer hover:underline"
          >
            <span>Get a Key on xdm.zihan.uk</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
