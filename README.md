# ⚡ XDM Turbo - Next-Gen Internet Download Manager

[![Version](https://img.shields.io/badge/version-1.0.3-emerald.svg)](https://github.com/zihanfakir/xdm/releases)
[![Website](https://img.shields.io/badge/website-xdm.zihan.uk-blue.svg)](https://xdm.zihan.uk)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)](https://github.com/zihanfakir/xdm/releases)

> **Full IDM (Internet Download Manager) Clone with Ultra-Modern Minimalist UI & Bandwidth Saturation Turbo Engine**
> 
> 🌐 **Official Website & Downloads:** [https://xdm.zihan.uk](https://xdm.zihan.uk)  
> 👤 **Author:** [Zihan Fakir](https://zihan.uk) (@zihanfakir)

XDM Turbo is an open-source download manager engineered to extract **100% of your device's available network bandwidth** by leveraging 32-connection HTTP Range streaming, dynamic segment subdivision (work-stealing), direct disk pre-allocation, and universal browser video capture.

---

## 🚀 Key Features

### 1. 🔥 Full Bandwidth Saturation (IDM Engine)
- **1 to 32 Parallel Connections:** Splits large files into up to 32 concurrent HTTP Range connections to bypass single-stream ISP caps and latency bottlenecks.
- **Dynamic Segment Subdivision (Adaptive Work Stealing):** When one segment finishes downloading early, XDM automatically slices the largest remaining unfinished segment in half and assigns the idle connection to it immediately. This guarantees all connection pipes stay 100% busy until the last byte!
- **Zero Disk-Thrashing Assembly:** Writes data directly to pre-allocated file byte offsets, eliminating tedious post-download file joining delays.
- **Full Pause & Resume Support:** Persists exact byte positions per segment in `.meta` state files. Resume interrupted downloads instantly.

### 2. 🎨 Minimalist & Modern UI
- **Dark Glassmorphic Theme:** Built with React, Tailwind CSS, and Lucide icons.
- **IDM Segment Visualizer:** Live interactive visual progress bar showing each active thread, its start/end byte range, and individual transfer speed.
- **Real-Time Speed Chart:** Live SVG speed graph tracking throughput second-by-second (Current Speed, Peak Speed, Average Speed, ETA).
- **Auto-Categorization:** Automatically sorts files into `Compressed`, `Video`, `Audio`, `Documents`, `Programs`, and `Others`.
- **Speed Limiter:** Toggle between Unlimited Turbo and custom limits (50 MB/s, 20 MB/s, 10 MB/s, 5 MB/s).

### 3. 🌐 Browser Integration & Desktop Shell
- **Desktop Window & System Tray:** Run natively as an Electron desktop application with custom frameless titlebar and Windows tray minimization.
- **Browser Interceptor (Tampermonkey / Violentmonkey):** Includes a built-in Userscript hook (`http://127.0.0.1:19684/extension/xdm-helper.user.js`) that automatically intercepts download clicks in Chrome, Edge, Brave, and Firefox!
- **1-Click Bookmarklet:** Drag to your browser bookmarks bar to send any page's link to XDM instantly.
- **Local REST & WebSocket API:** Fully scriptable via `curl` and WebSocket telemetry.

---

## 💻 How to Run

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

## 🛠 Project Structure

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
│   │   ├── SettingsModal.tsx        # Preferences & download directories
│   │   └── BrowserIntegrationModal.tsx # Browser hook & Userscript guide
│   ├── types/index.ts       # TypeScript interfaces
│   ├── utils/formatters.ts  # Speed, bytes, and time formatters
│   ├── App.tsx              # Main state & WebSocket manager
│   ├── main.tsx             # React entry point
│   └── index.css            # Tailwind styling
├── dist/                    # Production bundle
└── package.json
```
