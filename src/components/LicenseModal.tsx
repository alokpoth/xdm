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
  Crown,
  Radio,
  Clock,
  Info,
  MessageCircle,
  Send
} from 'lucide-react';
import { LicenseInfo } from '../types';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseInfo | null;
  onActivate: (key: string, name?: string, email?: string) => Promise<{ success: boolean; error?: string; message?: string }>;
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
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [copiedDevId, setCopiedDevId] = useState(false);
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
  }, [isOpen, license]);

  if (!isOpen) return null;

  const currentDeviceId = license?.deviceId || license?.hardwareId || 'Generating...';

  const handleCopyDevId = () => {
    if (!currentDeviceId || currentDeviceId === 'Generating...') return;
    navigator.clipboard.writeText(currentDeviceId);
    setCopiedDevId(true);
    setTimeout(() => setCopiedDevId(false), 2000);
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
      const res = await onActivate(keyInput.trim(), nameInput.trim(), emailInput.trim());
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'XDM Turbo PRO Activated Successfully Online!' });
        setKeyInput('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to activate license on server.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error during license activation.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateClick = async () => {
    if (!window.confirm('Are you sure you want to deactivate your PRO license on this device? This will free up 1 device seat on the server.')) {
      return;
    }
    setLoading(true);
    try {
      await onDeactivate();
      setFeedback({ type: 'success', message: 'License deactivated on this device.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to deactivate license' });
    } finally {
      setLoading(false);
    }
  };

  const isPro = Boolean(license?.isPro);
  const isBanned = Boolean(license?.isBanned || license?.status === 'banned');
  const isGraceExpired = license?.status === 'grace_expired';

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-2xl sm:max-w-3xl rounded-3xl liquid-modal-panel border shadow-2xl overflow-hidden animate-fadeIn max-h-[92vh] flex flex-col backdrop-blur-2xl">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/[0.08] theme-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-lg ${
              isBanned
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-rose-500/20'
                : isPro 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/20' 
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-blue-500/20'
            }`}>
              {isBanned ? <AlertTriangle className="w-4.5 h-4.5" /> : isPro ? <Crown className="w-4.5 h-4.5 fill-emerald-400 text-emerald-400" /> : <KeyRound className="w-4.5 h-4.5" />}
            </div>
            <div>
              <h2 className="font-bold text-sm text-white theme-text-primary flex items-center space-x-2 tracking-tight">
                <span>{isBanned ? 'Device Permanently Banned' : isPro ? 'XDM Turbo PRO' : 'XDM Turbo Activation'}</span>
                {isBanned ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    LOCKED
                  </span>
                ) : isPro ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    ONLINE VERIFIED
                  </span>
                ) : isGraceExpired ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    GRACE EXPIRED
                  </span>
                ) : null}
              </h2>
              <p className="text-[11px] text-slate-400 theme-text-secondary font-medium">
                {isBanned
                  ? 'Unauthorized cracking attempt detected • Hardware permanently locked'
                  : isPro 
                    ? `Authenticated via Central License Server • 64 Parallel Streams • ${license?.expiresAt ? (() => {
                        const days = Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
                        return `${days} Days Validity (${new Date(license.expiresAt).toLocaleDateString()})`;
                      })() : 'Lifetime Access'}`
                    : 'Online Activation & Instant Multi-Threaded Unlock'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white theme-text-secondary hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto custom-scrollbar flex-1">
          {/* Device Banned Alert */}
          {isBanned && (
            <div className="p-3.5 rounded-xl border bg-rose-950/60 border-rose-500/50 text-rose-200 flex items-start space-x-2.5 shadow-lg">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wide text-rose-300">Device Locked Due to Tampering</h4>
                <p className="text-[11px] text-rose-200/90 mt-1 leading-relaxed">
                  {license?.banReason || 'Unauthorized file modification, token forgery, or cracking attempts were detected on this computer. This hardware device ID has been permanently blocked by anti-piracy protection.'}
                </p>
              </div>
            </div>
          )}

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
            <div className="theme-modal-pro-card rounded-2xl p-4 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm text-slate-100 theme-text-primary">
                    PRO License Activated
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 theme-badge-emerald font-semibold">
                  {license?.expiresAt ? `Expires: ${new Date(license.expiresAt).toLocaleDateString()}` : 'Lifetime Perpetual Access'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="theme-modal-subcard bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <div className="text-slate-500 font-mono text-[10px]">ACTIVE KEY</div>
                  <div className="font-mono font-bold truncate mt-0.5 text-slate-200 theme-text-primary">
                    {license?.maskedKey || (isPro ? 'PRO-ACTIVE-LICENSE' : 'UNREGISTERED')}
                  </div>
                </div>
                <div className="theme-modal-subcard bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <div className="text-slate-500 font-mono text-[10px]">LICENSE VALIDITY</div>
                  <div className="font-mono font-semibold flex items-center space-x-1 mt-0.5 text-emerald-400">
                    <Clock className="w-3 h-3" />
                    <span>
                      {license?.expiresAt ? (() => {
                        const remainingMs = license.expiresAt - Date.now();
                        const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
                        const remainingHours = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
                        if (remainingDays <= 1) {
                          return `${remainingHours} Hours Left (${new Date(license.expiresAt).toLocaleDateString()})`;
                        }
                        return `${remainingDays} Days Left (${new Date(license.expiresAt).toLocaleDateString()})`;
                      })() : 'Lifetime Perpetual Access'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="theme-modal-subcard bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px] space-y-1">
                <div className="flex items-center justify-between text-slate-400 theme-text-secondary">
                  <span>Server Authority:</span>
                  <span className="font-mono text-slate-300 theme-text-primary flex items-center space-x-1">
                    <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                    <span>Ed25519 Cryptographic Verifier</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 theme-text-secondary">
                  <span>Turbo Streams:</span>
                  <span className="font-mono font-bold text-emerald-400">64 Parallel Streams Unlocked</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 theme-text-secondary">
                  <span>Offline Defense Shield:</span>
                  <span className="font-mono text-slate-300 theme-text-primary">
                    {license?.offlineGraceRemainingHours ? (() => {
                      const shieldDays = Math.max(1, Math.ceil(license.offlineGraceRemainingHours / 24));
                      return `${shieldDays} Days Offline Grace Available`;
                    })() : (license?.expiresAt ? (() => {
                      const remainingDays = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
                      const maxDays = Math.min(7, remainingDays);
                      return `${maxDays} Days Offline Grace (Capped to Expiry)`;
                    })() : '7 Days Offline Grace Period')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 theme-text-secondary">
                  <span>Bound Device Name:</span>
                  <span className="font-mono text-slate-300 theme-text-primary">{license?.deviceName || 'This Computer'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleDeactivateClick}
                  disabled={loading}
                  className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                >
                  Unbind &amp; Deactivate Device
                </button>
              </div>
            </div>
          ) : (
            /* Free Tier Activation Box */
            <form onSubmit={handleSubmitActivate} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 theme-text-secondary uppercase tracking-wider mb-1.5 font-mono">
                  Enter Product License Key
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="XDM-PRO-XXXX-XXXX-XXXX-XXXX"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#090d19] theme-input border border-white/[0.08] focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none text-white font-mono text-xs placeholder-slate-600 tracking-wider shadow-inner"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasteKey}
                    className="theme-secondary-btn px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer active:scale-95 shadow-sm"
                    title="Paste from clipboard"
                  >
                    Paste
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 theme-text-secondary mb-1">
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090d19] theme-input border border-white/[0.08] focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none text-white text-xs shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 theme-text-secondary mb-1">
                    Account Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090d19] theme-input border border-white/[0.08] focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none text-white text-xs font-mono shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-emerald-glow w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{loading ? 'Authenticating with Server...' : isBanned ? 'Submit Unban / Activation Key' : 'Activate PRO Online'}</span>
              </button>
            </form>
          )}

          {/* Purchase PRO License Callout (when not PRO) */}
          {!isPro && (
            <div className="theme-modal-subcard rounded-2xl p-3 bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5 text-center sm:text-left">
                <div className="text-[11px] font-bold text-white flex items-center justify-center sm:justify-start space-x-1.5 font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Purchase PRO Key ($9.99 / ৳499)</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Instant activation via bKash / Nagad / Binance from Zihan Fakir:
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="https://wa.me/zihanfakir"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = 'https://wa.me/zihanfakir';
                    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold font-mono transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>WhatsApp: @zihanfakir</span>
                </a>
                <a
                  href="https://t.me/zihanfakir"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = 'https://t.me/zihanfakir';
                    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold font-mono transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Telegram: @zihanfakir</span>
                </a>
              </div>
            </div>
          )}

          {/* Free vs PRO Feature Matrix (when not PRO) */}
          {!isPro && (
            <div className="theme-matrix-card rounded-2xl p-3.5 bg-gradient-to-b from-amber-500/10 via-slate-900/60 to-slate-950/80 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-300 theme-text-amber flex items-center space-x-1.5 font-mono">
                  <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>XDM Turbo: Free vs PRO Matrix</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  UPGRADE UNLOCKS ALL
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="grid grid-cols-3 py-1 border-b border-slate-800/80 theme-border-subtle text-[10px] font-mono uppercase text-slate-400 theme-text-secondary">
                  <span>Feature</span>
                  <span className="text-center text-slate-400 theme-text-secondary">Free Tier</span>
                  <span className="text-right text-amber-400 font-bold">PRO Edition</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Turbo Streams</span>
                  <span className="text-center font-mono text-slate-400 theme-text-secondary">Up to 4</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">64 Turbo Streams</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Concurrent Downloads</span>
                  <span className="text-center font-mono text-slate-400 theme-text-secondary">1 at a time</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">Up to 10 Tasks</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Browser Extension</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Locked</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">1-Click Auto Intercept</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Video Grabber</span>
                  <span className="text-center font-mono text-slate-400 theme-text-secondary">720p HD</span>
                  <span className="text-right font-mono text-amber-400 dark:text-amber-300 font-bold">1080p, 2K, 4K & MP3</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Dynamic Slicing</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Fixed</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">Work-Stealing AI</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Bandwidth Limiter</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Locked</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">Custom Throttling</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Night Scheduler</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Locked</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">Automated Start/Stop</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Auto-Shutdown PC</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Locked</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">60s Auto Power-Off</span>
                </div>

                <div className="grid grid-cols-3 py-1 border-b border-slate-800/40 theme-border-subtle items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Clipboard Sniffer</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Manual</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">Instant URL Popup</span>
                </div>

                <div className="grid grid-cols-3 py-1 items-center">
                  <span className="text-slate-300 theme-text-primary font-medium">Windows Toast</span>
                  <span className="text-center font-mono text-slate-500 theme-text-secondary">Chime only</span>
                  <span className="text-right font-mono text-emerald-400 font-bold">Action Center Toasts</span>
                </div>
              </div>
            </div>
          )}

          {/* Hardware Device Identifier Card */}
          <div className="theme-modal-subcard rounded-2xl p-3 bg-slate-900/60 border border-slate-800 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 theme-text-secondary flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>Device Identifier (Seat ID)</span>
              </span>
              <button
                type="button"
                onClick={handleCopyDevId}
                className="theme-secondary-btn flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {copiedDevId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedDevId ? 'Copied!' : 'Copy ID'}</span>
              </button>
            </div>
            <div className="theme-code-box font-mono text-xs text-slate-200 theme-text-primary bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80 select-all truncate">
              {currentDeviceId}
            </div>
            <p className="text-[10px] text-slate-500 theme-text-secondary leading-relaxed">
              Assigned automatically for device seat enforcement. Evaluated against server limits without exposing personal data.
            </p>
          </div>

          {/* Privacy & Security Disclosure Card */}
          <div className="theme-modal-subcard rounded-2xl p-3 bg-slate-950/60 border border-slate-800/80 space-y-1.5 shadow-sm">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 theme-text-secondary flex items-center space-x-1.5">
              <Info className="w-3 h-3 text-emerald-400" />
              <span>Telemetry &amp; Privacy Notice</span>
            </div>
            <p className="text-[10px] text-slate-500 theme-text-secondary leading-relaxed">
              We collect strictly minimal licensing telemetry: an anonymized hardware hash, host computer name, client version, and last-seen heartbeat. We never collect, transmit, or inspect your downloaded files, URLs, passwords, or personal files.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="liquid-modal-footer px-6 py-4 bg-[#080d19]/90 border-t border-white/[0.06] flex items-center justify-between shrink-0 backdrop-blur-xl">
          <div className="flex items-center space-x-3">
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
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1.5 cursor-pointer hover:underline"
            >
              <span className="font-mono">xdm.zihan.xyz</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <span className="text-slate-600 font-mono text-xs">|</span>
            <span className="text-xs text-slate-400 theme-text-secondary font-mono">v1.1.0</span>
            <span className="text-slate-600 font-mono text-xs hidden sm:inline">|</span>
            <a
              href="https://alokpoth.zihan.xyz"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                  (window as any).electronAPI.openExternal('https://alokpoth.zihan.xyz');
                } else {
                  window.open('https://alokpoth.zihan.xyz', '_blank');
                }
              }}
              className="hidden sm:inline-flex items-center space-x-1.5 text-[11px] text-slate-400 hover:text-white theme-text-secondary cursor-pointer transition-colors"
            >
              <span className="opacity-70">from</span>
              <img src="/alokpoth-icon-dark.png" alt="Alokpoth" className="w-3 h-3 object-contain alokpoth-logo-dark" />
              <img src="/alokpoth-icon-light.png" alt="Alokpoth" className="w-3 h-3 object-contain alokpoth-logo-light" />
              <span className="font-bold tracking-tight">Alokpoth</span>
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-secondary-btn px-6 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
