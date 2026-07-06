# Changelog

## [Docs Update] - Current

### Changed
- Added explicit local run instructions to `README.md` for both the Python backend and Vite frontend.
- Corrected the frontend description from React/Next.js to the current Vite + React implementation.
- Added `requirements.txt` with the required FastRTC VAD extra.
- Documented the current dependency setup steps for `numpy`, `fastrtc[vad]`, `fastapi`, `uvicorn`, and npm packages.
- Added troubleshooting notes for missing Python modules, Tailwind native binding install issues, microphone permissions, and WebRTC hosting requirements.
- Updated the production direction to reflect the intended Next.js migration, settings modal, GPU backend, S2S model service, and Gaussian avatar animation service.

### Fixed
- Removed unused FastRTC imports that prevented `server.py` from starting with the installed FastRTC package.

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
  - Generate dummy position offsets in an async task.

### Known Limitations
- The Python backend is a scaffold; it does not yet integrate `LLaMA-Omni` or `GaussianSpeech` architectures.
- The dummy offsets are generated but are not actually sent over WebSocket or WebRTC Data Channel yet.
- The 3D viewer currently loads a static scene and does not yet consume the data channel offsets to deform the splats frame-by-frame.
- The UI still includes game-menu style items and does not yet provide the intended minimal chatbot controls or settings configuration modal.
- The frontend is currently Vite + React, not the originally requested Next.js `page.tsx` structure.
