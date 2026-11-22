# XDM Turbo - Next-Gen Internet Download Manager

[![Version](https://img.shields.io/badge/version-1.1.0-emerald.svg)](https://xdm.zihan.xyz)
[![Website](https://img.shields.io/badge/website-xdm.zihan.xyz-blue.svg)](https://xdm.zihan.xyz)
[![Alokpoth](https://img.shields.io/badge/from-Alokpoth-0f172a.svg)](https://alokpoth.zihan.xyz)
[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)](https://xdm.zihan.xyz)

> **High-Performance Internet Download Manager with Minimalist Dark UI & 64-Stream Bandwidth Saturation Turbo Engine — from [Alokpoth (আলোকপথ)](https://alokpoth.zihan.xyz)**
> 
> - **Official Website & Downloads:** [https://xdm.zihan.xyz](https://xdm.zihan.xyz)  
> - **Publisher:** [Alokpoth](https://alokpoth.zihan.xyz) • **Author:** [Zihan Fakir](https://zihan.uk) (@zihanfakir)  
> - **PRO Activation Support:** WhatsApp: `@zihanfakir` | Telegram: `@zihanfakir`

XDM Turbo is a high-performance download manager engineered to extract **100% of your device's available network bandwidth** by leveraging up to 64 concurrent HTTP Range connections, dynamic segment subdivision (work-stealing), direct pre-allocated disk writes, and universal browser media stream integration.

---

## Key Features

### 1. Full Bandwidth Saturation (64-Stream Turbo Engine)
- **1 to 64 Parallel Connections:** Splits large files into up to 64 concurrent HTTP Range byte streams to maximize single-connection throughput and overcome server-side connection bottlenecks.
- **Dynamic Segment Subdivision (Adaptive Work Stealing):** When one stream finishes downloading early, XDM actively subdivides the largest remaining unfinished segment and re-assigns idle connections instantly, keeping all pipes 100% saturated until the last byte.
- **Zero Disk-Thrashing Assembly:** Writes data directly to pre-allocated file byte offsets, eliminating tedious post-download file joining delays.
- **Full Pause & Resume Support:** Persists exact byte positions per segment in `.meta` state files. Resume interrupted downloads instantly.

### 2. Modern Glassmorphic UI
- **Dark Obsidian Theme:** Built with React, Tailwind CSS, Lucide vector icons, and GSAP/Lenis animations.
- **Segment Visualizer:** Real-time visual progress bar showing each active thread, its start/end byte range, and individual transfer speed.
- **Real-Time Speed Chart:** Live SVG speed graph tracking throughput second-by-second (Current Speed, Peak Speed, Average Speed, ETA).
- **Auto-Categorization:** Automatically sorts files into `Compressed`, `Video`, `Audio`, `Documents`, `Programs`, and `Others`.
- **Speed Limiter:** Dial in exact bandwidth limits (2 MB/s, 10 MB/s, 50 MB/s) or run on Unlimited Turbo.

### 3. Browser Integration & Background Tray Lifecycle
- **Universal Video Grabber:** Injects a floating download button over web video players, media streams, and HTML5 video platforms with 1080p, 4K, and MP3 extraction.
- **System Tray Background Operation:** Minimizes to the Windows system notification area on window close, ensuring background downloads never interrupt.
- **Browser Interceptor (Tampermonkey / Violentmonkey):** Includes a built-in Userscript companion (`http://127.0.0.1:19684/extension/xdm-helper.user.js`) that automatically intercepts download clicks across Chrome, Edge, Brave, and Firefox.
- **Local REST & WebSocket API:** Fully scriptable via `curl` and WebSocket telemetry.

---

## Commercial PRO Licensing

Upgrade to **XDM Turbo PRO** to unlock:
- 64 Parallel Turbo Streams (Max ISP Throughput)
- Universal 4K UHD & 60 FPS Video Sniffer
- Automatic DASH & HLS Video Muxing (FFmpeg)
- Dynamic Work-Stealing Multi-Threading
- Speed Throttle & Unlimited Turbo Bandwidth
- Up to 10 Simultaneous Download Tasks

### How to Purchase & Activate:
1. Contact developer **Zihan Fakir** directly:
   - **WhatsApp:** `@zihanfakir` ([https://wa.me/zihanfakir](https://wa.me/zihanfakir))
   - **Telegram:** `@zihanfakir` ([https://t.me/zihanfakir](https://t.me/zihanfakir))
   - **Email:** `zihanfakir@gmail.com`
2. Payment methods accepted: **bKash / Nagad / Rocket / Binance USDT / International Card**.
3. Receive your official 20-character license key within 5 minutes.
4. In XDM Turbo, click **"Upgrade to PRO"**, enter your key, and activate instantly.

---

## How to Run

### Option 1: Native Desktop Application (Electron)
```powershell
npm run app
```

### Option 2: Web Server Mode (Accessible via Browser at `http://localhost:19684`)
```powershell
npm start
```
Then open [http://localhost:19684](http://localhost:19684) in any browser.

### Option 3: Full Development Mode (Hot Reload)
```powershell
npm run dev
```

---

## Project Structure

```
E:\XDM\
├── electron/
│   ├── main.js             # Electron main process (custom titlebar, tray, IPC)
│   └── preload.js          # Secure IPC bridge
├── server/
│   ├── engine/
│   │   ├── DownloadTask.js     # Multi-threaded range engine with dynamic slicing
│   │   └── DownloadManager.js  # Task queue, persistence, explorer integration
│   └── server.js           # REST API & WebSocket server on port 19684
├── src/
│   ├── components/
│   │   ├── Titlebar.tsx             # Frameless titlebar with window controls
│   │   ├── Sidebar.tsx              # Categories and live bandwidth speedometer
│   │   ├── TopNavbar.tsx            # Add URL, speed throttle, batch actions
│   │   ├── DownloadRow.tsx          # Download cards with segment progress
│   │   ├── SegmentProgressBar.tsx   # IDM multi-thread segment visualizer
│   │   ├── AddDownloadModal.tsx     # Add URL modal with auto-probe & thread slider
│   │   ├── DownloadDetailsModal.tsx # Speed curve graph & thread inspector
│   │   ├── SettingsModal.tsx        # Preferences, 64-stream stepped slider
│   │   ├── LicenseModal.tsx         # PRO activation & contact links
│   │   └── BrowserIntegrationModal.tsx # Browser hook & Userscript guide
│   ├── types/index.ts       # TypeScript interfaces
│   ├── utils/formatters.ts  # Speed, bytes, and time formatters
│   ├── App.tsx              # Main state & WebSocket manager
│   ├── main.tsx             # React entry point
│   └── index.css            # Tailwind styling
├── dist/                    # Production bundle
└── package.json
```
