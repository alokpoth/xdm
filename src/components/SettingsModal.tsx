import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Folder, 
  Check, 
  Volume2, 
  HardDrive, 
  Gauge, 
  Clock, 
  Power, 
  Bell, 
  ClipboardList,
  Crown,
  Lock,
  Sparkles,
  Zap,
  FolderOpen
} from 'lucide-react';
import { Settings as SettingsType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsType;
  onSave: (newSettings: Partial<SettingsType>) => Promise<void>;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  isPro = false,
  onOpenLicenseModal
}) => {
  const [form, setForm] = useState<SettingsType>({
    defaultSaveDir: '',
    maxConcurrentDownloads: 3,
    defaultConnections: 64,
    autoStart: true,
    soundNotification: true,
    speedLimit: 0,
    categoriesDir: true,
    clipboardMonitoring: true,
    windowsNotifications: true,
    schedulerEnabled: false,
    scheduleStartTime: '01:00',
    scheduleStopTime: '06:00',
    shutdownOnCompletion: false,
    ...settings
  });
  const [saved, setSaved] = useState(false);
  const [autoLaunchOnStartup, setAutoLaunchOnStartup] = useState(false);

  useEffect(() => {
    setForm({
      defaultSaveDir: '',
      maxConcurrentDownloads: 3,
      defaultConnections: 64,
      autoStart: true,
      soundNotification: true,
      speedLimit: 0,
      categoriesDir: true,
      clipboardMonitoring: true,
      windowsNotifications: true,
      schedulerEnabled: false,
      scheduleStartTime: '01:00',
      scheduleStopTime: '06:00',
      shutdownOnCompletion: false,
      ...settings
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    if (isOpen && typeof window !== 'undefined' && (window as any).electronAPI?.getAutoStart) {
      (window as any).electronAPI.getAutoStart().then((enabled: boolean) => {
        setAutoLaunchOnStartup(Boolean(enabled));
      }).catch(() => {});
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, isOpen, onClose]);

  if (!isOpen) return null;

  const handleBrowseDir = async () => {
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.openDirectoryDialog;
    if (isElectron) {
      const selected = await (window as any).electronAPI.openDirectoryDialog(form.defaultSaveDir);
      if (selected) setForm({ ...form, defaultSaveDir: selected });
    }
  };

  const handleToggleAutoStart = async (checked: boolean) => {
    setAutoLaunchOnStartup(checked);
    if (typeof window !== 'undefined' && (window as any).electronAPI?.setAutoStart) {
      await (window as any).electronAPI.setAutoStart(checked);
    }
  };

  const handleSave = async () => {
    const payload = { ...form };
    if (!isPro) {
      payload.speedLimit = 0;
      payload.schedulerEnabled = false;
      payload.shutdownOnCompletion = false;
      payload.clipboardMonitoring = false;
      payload.windowsNotifications = false;
      payload.defaultConnections = Math.min(payload.defaultConnections, 4);
      payload.maxConcurrentDownloads = 1;
    }
    if (typeof window !== 'undefined' && (window as any).electronAPI?.setClipboardMonitoring) {
      (window as any).electronAPI.setClipboardMonitoring(isPro ? (payload.clipboardMonitoring ?? true) : false);
    }
    await onSave(payload);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-xl rounded-3xl liquid-modal-panel border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden backdrop-blur-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500/25 to-teal-400/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-sm text-white theme-text-primary tracking-tight">Preferences</h2>
                {!isPro ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 theme-text-secondary border border-white/[0.1] font-semibold">
                    Free Edition
                  </span>
                ) : (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center space-x-1">
                    <Crown className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                    <span>PRO Lifetime</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 theme-text-secondary">Customize downloads, network speeds, and system behavior</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white theme-text-secondary hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 space-y-6 text-xs overflow-y-auto custom-scrollbar flex-1">
          {/* Section 1: Storage & Folder */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
              <FolderOpen className="w-4 h-4" />
              <span>Download Location</span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={form.defaultSaveDir}
                onChange={(e) => setForm({ ...form, defaultSaveDir: e.target.value })}
                placeholder="Choose default downloads folder..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 theme-input border border-white/10 focus:border-emerald-500 text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 cursor-pointer shrink-0 transition-all active:scale-95"
              >
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Section 2: Speed Acceleration & Connections */}
          <div className="space-y-4 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                <Zap className="w-4 h-4" />
                <span>Download Acceleration (Connections)</span>
              </div>
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                {isPro ? form.defaultConnections : Math.min(form.defaultConnections, 4)} Connections
              </span>
            </div>

            <div>
              <input
                type="range"
                min="1"
                max={isPro ? 64 : 4}
                step="1"
                value={isPro ? form.defaultConnections : Math.min(form.defaultConnections, 4)}
                onChange={(e) => setForm({ ...form, defaultConnections: parseInt(e.target.value, 10) })}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 rounded-lg"
              />
              <div className="flex justify-between text-[11px] text-slate-400 theme-text-secondary mt-1">
                <span>1 (Single)</span>
                <span>2 (Standard)</span>
                <span className="font-semibold text-emerald-400">4 (Maximum Free)</span>
                <span className={isPro ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {isPro ? '64 (Turbo PRO)' : '🔒 8–64 (PRO Only)'}
                </span>
              </div>
            </div>

            {!isPro && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center space-x-2 text-[11px] text-slate-300 theme-text-secondary">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Free edition is capped at 4 streams. Turbo 8 to 64 streams is unlocked in PRO.</span>
                </div>
                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={onOpenLicenseModal}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 underline shrink-0 ml-2"
                  >
                    Unlock PRO
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Concurrent Downloads */}
          <div className="space-y-3 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 theme-text-primary">
                <HardDrive className="w-4 h-4 text-sky-400" />
                <span>Simultaneous Active Downloads</span>
              </div>
              <span className="text-xs font-bold text-slate-200 theme-text-primary bg-white/[0.06] px-2.5 py-0.5 rounded-full border border-white/10">
                {isPro ? form.maxConcurrentDownloads : 1} File{isPro && form.maxConcurrentDownloads > 1 ? 's' : ''} at a time
              </span>
            </div>

            <input
              type="range"
              min="1"
              max={isPro ? 10 : 1}
              step="1"
              value={isPro ? form.maxConcurrentDownloads : 1}
              onChange={(e) => setForm({ ...form, maxConcurrentDownloads: parseInt(e.target.value, 10) })}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 rounded-lg disabled:opacity-40"
              disabled={!isPro}
            />

            {!isPro && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center space-x-2 text-[11px] text-slate-300 theme-text-secondary">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Free edition downloads 1 file at a time. Multi-download queue (up to 10) requires PRO.</span>
                </div>
                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={onOpenLicenseModal}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 underline shrink-0 ml-2"
                  >
                    Unlock PRO
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Speed Limiter */}
          <div className="space-y-3 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 theme-text-primary">
                <Gauge className="w-4 h-4 text-amber-400" />
                <span>Speed Limiter</span>
              </div>
              {!isPro ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-amber-400 border border-amber-400/30 font-bold flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>PRO Feature</span>
                </span>
              ) : (
                <span className="text-xs font-bold text-emerald-400">
                  {form.speedLimit === 0 ? 'Unlimited Speed' : `Capped at ${form.speedLimit >= 1024 ? (form.speedLimit / 1024).toFixed(1) + ' MB/s' : form.speedLimit + ' KB/s'}`}
                </span>
              )}
            </div>

            {!isPro ? (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <p className="text-[11px] text-slate-400 theme-text-secondary">
                  Throttle download speed to prevent home lag while gaming or watching videos.
                </p>
                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={onOpenLicenseModal}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 underline shrink-0 ml-2"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { label: 'Unlimited', value: 0 },
                  { label: '1 MB/s', value: 1024 },
                  { label: '2 MB/s', value: 2048 },
                  { label: '5 MB/s', value: 5120 },
                  { label: '10 MB/s', value: 10240 },
                ].map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setForm({ ...form, speedLimit: preset.value })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      form.speedLimit === preset.value
                        ? 'bg-emerald-500 text-black font-bold shadow-md'
                        : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.1] border border-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Scheduler & Power */}
          <div className="space-y-3 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 theme-text-primary">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>Scheduled Downloads & Auto-Shutdown</span>
              </div>
              {!isPro ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-amber-400 border border-amber-400/30 font-bold flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>PRO Feature</span>
                </span>
              ) : (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.schedulerEnabled ?? false}
                    onChange={(e) => setForm({ ...form, schedulerEnabled: e.target.checked })}
                    className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 theme-text-secondary font-medium">Enable Scheduler</span>
                </label>
              )}
            </div>

            {!isPro ? (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <p className="text-[11px] text-slate-400 theme-text-secondary">
                  Schedule downloads for night hours and automatically turn off your PC when finished.
                </p>
                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={onOpenLicenseModal}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 underline shrink-0 ml-2"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            ) : (
              <>
                {form.schedulerEnabled && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
                    <div>
                      <label className="block text-[11px] text-slate-400 theme-text-secondary mb-1 font-medium">Start downloads at:</label>
                      <input
                        type="time"
                        value={form.scheduleStartTime || '01:00'}
                        onChange={(e) => setForm({ ...form, scheduleStartTime: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-xl bg-black/40 theme-input border border-white/10 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 theme-text-secondary mb-1 font-medium">Stop downloads at:</label>
                      <input
                        type="time"
                        value={form.scheduleStopTime || '06:00'}
                        onChange={(e) => setForm({ ...form, scheduleStopTime: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-xl bg-black/40 theme-input border border-white/10 text-xs"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center space-x-2.5 text-slate-300 theme-text-secondary cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={form.shutdownOnCompletion ?? false}
                    onChange={(e) => setForm({ ...form, shutdownOnCompletion: e.target.checked })}
                    className="rounded bg-black/40 border-white/20 text-rose-500 focus:ring-0"
                  />
                  <div className="flex items-center space-x-1.5">
                    <Power className="w-3.5 h-3.5 text-rose-400" />
                    <span>Automatically shut down PC when all downloads finish (with 60-second warning)</span>
                  </div>
                </label>
              </>
            )}
          </div>

          {/* Section 6: Notifications & Preferences */}
          <div className="space-y-3 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 theme-text-primary">
              <Bell className="w-4 h-4 text-emerald-400" />
              <span>General Preferences & Notifications</span>
            </div>

            <div className="space-y-2.5">
              <label className="flex items-center space-x-2.5 text-slate-300 theme-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.soundNotification}
                  onChange={(e) => setForm({ ...form, soundNotification: e.target.checked })}
                  className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0"
                />
                <div className="flex items-center space-x-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Play sound alert when a download finishes</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 text-slate-300 theme-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.categoriesDir}
                  onChange={(e) => setForm({ ...form, categoriesDir: e.target.checked })}
                  className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0"
                />
                <span>Automatically organize files into category folders (Videos, Music, Compressed)</span>
              </label>

              <label className="flex items-center space-x-2.5 text-slate-300 theme-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoStart}
                  onChange={(e) => setForm({ ...form, autoStart: e.target.checked })}
                  className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0"
                />
                <span>Start downloads immediately when added</span>
              </label>

              <label className="flex items-center space-x-2.5 text-slate-300 theme-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLaunchOnStartup}
                  onChange={(e) => handleToggleAutoStart(e.target.checked)}
                  className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0"
                />
                <span>Start XDM Turbo quietly on Windows boot (minimized to system tray)</span>
              </label>

              <label 
                onClick={(e) => {
                  if (!isPro && onOpenLicenseModal) {
                    e.preventDefault();
                    onOpenLicenseModal();
                  }
                }}
                className="flex items-center justify-between text-slate-300 theme-text-secondary cursor-pointer pt-2 border-t border-white/[0.06]"
              >
                <div className="flex items-center space-x-2.5">
                  <input
                    type="checkbox"
                    disabled={!isPro}
                    checked={isPro ? (form.clipboardMonitoring ?? true) : false}
                    onChange={(e) => setForm({ ...form, clipboardMonitoring: e.target.checked })}
                    className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 disabled:opacity-40"
                  />
                  <div className="flex items-center space-x-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-violet-400" />
                    <span>Automatic clipboard link detection</span>
                  </div>
                </div>
                {!isPro && (
                  <span className="text-[10px] text-amber-400 bg-white/[0.06] px-2 py-0.5 rounded-full border border-amber-400/30 font-bold flex items-center space-x-1">
                    <Lock className="w-2.5 h-2.5" />
                    <span>PRO</span>
                  </span>
                )}
              </label>

              <label 
                onClick={(e) => {
                  if (!isPro && onOpenLicenseModal) {
                    e.preventDefault();
                    onOpenLicenseModal();
                  }
                }}
                className="flex items-center justify-between text-slate-300 theme-text-secondary cursor-pointer"
              >
                <div className="flex items-center space-x-2.5">
                  <input
                    type="checkbox"
                    disabled={!isPro}
                    checked={isPro ? (form.windowsNotifications ?? true) : false}
                    onChange={(e) => setForm({ ...form, windowsNotifications: e.target.checked })}
                    className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 disabled:opacity-40"
                  />
                  <div className="flex items-center space-x-1.5">
                    <Bell className="w-3.5 h-3.5 text-sky-400" />
                    <span>Windows desktop notifications</span>
                  </div>
                </div>
                {!isPro && (
                  <span className="text-[10px] text-amber-400 bg-white/[0.06] px-2 py-0.5 rounded-full border border-amber-400/30 font-bold flex items-center space-x-1">
                    <Lock className="w-2.5 h-2.5" />
                    <span>PRO</span>
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 liquid-modal-footer border-t border-white/[0.08] flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400 theme-text-secondary">XDM Turbo Preferences</span>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="theme-secondary-btn px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-emerald-glow px-6 py-2 rounded-xl text-xs font-bold text-black transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg active:scale-95"
            >
              {saved && <Check className="w-3.5 h-3.5" />}
              <span>{saved ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
