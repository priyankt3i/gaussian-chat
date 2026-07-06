# Changelog

## [Phase 1 - Scaffold] - Current Status

### Added
- **UI/UX:** Implemented a minimalist, *Detroit: Become Human*-inspired menu interface.
- **3D Renderer:** Integrated `@mkkellogg/gaussian-splats-3d` with React Three Fiber to load and display static `.splat` files.
- **WebRTC Client:** Created a custom `useWebRTC` hook in React to handle:
  - Microphone access and local audio streaming.
  - RTCPeerConnection setup and SDP offer exchange.
  - Data Channel initialization for receiving 3D coordinate offsets.
  - Audio playback for incoming AI audio.
- **Backend Scaffold:** Created a `server.py` FastAPI app utilizing `fastrtc` to:
  - Accept incoming WebRTC connections.
  - Echo incoming audio chunks (placeholder for S2S inference).
  - Stream dummy `Float32Array` position offsets via an async task.

### Known Limitations
- The Python backend is a scaffold; it does not yet integrate `LLaMA-Omni` or `GaussianSpeech` architectures.
- The 3D viewer currently loads a static scene and does not yet consume the data channel offsets to deform the splats frame-by-frame.
