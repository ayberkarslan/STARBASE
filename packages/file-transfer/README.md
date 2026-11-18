# STARBASE file transfer core

This package contains the browser-to-browser transfer transport extracted from STAXFile. STARBASE owns room authorization, signaling, and the B4 interface. The legacy Socket.IO server is not used by this package.

`TransferLink` manages one encrypted WebRTC data channel per room peer. The host sends SDP and ICE signals through STARBASE's authenticated room WebSocket. Files move directly between browsers in 16 KiB chunks with acknowledgement and backpressure; they never enter D1 or the signaling server. The receiver must approve each file. Where available, the browser's save picker streams directly to disk. Other browsers keep the accepted file in memory until the user downloads it.

Only Cloudflare's free STUN server is configured. Restricted networks may block direct peer connections; the UI must explain that there is no relay fallback. No application-level file-size limit is imposed, but browser and device limits still apply.
