###  What's New in XDM Turbo v1.0.3

-  **10x Faster IDM Turbo Engine:**
  - Upgraded to **32 parallel Range connection threads** by default with 512 socket pooling.
  - Enabled **TCP_NODELAY** across all streaming sockets to bypass Nagle buffering and ISP latency bottlenecks.
  - Replaced blocking disk writes with **asynchronous non-blocking file streaming**, allowing network sockets to achieve full line-rate throughput without event loop starvation.
-  **Fixed Erratic Progress Bar Jumps ("Download line jumping back and forth"):**
  - Replaced the fractured per-row segment bar with an ultra-smooth, unified master progress bar with smooth CSS transitions.
  - Enforced strict monotonic progress guarantee (progress is mathematically non-decreasing).
  - Ensured all dynamic split chunks are sorted by starting byte offset in both UI components (`SegmentProgressBar` and `DownloadDetailsModal`).
-  **Smooth Non-Elevated Installation (`asInvoker`):**
  - Configured installer execution level to `asInvoker` and disabled administrator requirement so Windows UAC elevation warnings are completely eliminated.
  - Added clear SmartScreen bypass guidance for first-time launch.
-  **100% Bug-Free State Machine:**
  - Resolved socket destruction error loop where completed segments previously cycled into retry states.
  - Added asynchronous disk write flush verification before marking completion.

####  Download Assets
- **Windows Setup Installer:** `XDM.Turbo.Setup.1.0.3.exe`
- **Portable Standalone Edition:** `XDM.Turbo.1.0.3.exe`
