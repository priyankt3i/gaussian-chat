# Changelog

## [Persona Avatars] - Current

### Added
- **Avatar Studio:** upload a portrait, write or Claude-draft a persona prompt, greeting and tagline, pick a voice, optionally attach a voice sample, and record a consent basis. Photos are validated and square-cropped by the `portrait` face engine (`backend/face.py`).
- **Talk:** avatar gallery and live call screen with an animated portrait, live transcript, and two talk modes: always listening (VAD with barge-in) and push to talk (button or Space).
- **Voice pipeline (`backend/conversation.py`):** Moonshine speech-to-text, Claude streamed in character with per-call history, sentence-by-sentence Kokoro text-to-speech, spoken greeting on connect, and interruption-aware history.
- **API:** `/avatars` (list, get, create, delete, files), `/avatars/persona-draft`, `/voices`, `/sessions` (bind a WebRTC call to an avatar) and `/sessions/{id}/captions` (server-sent events).
- Built-in Albert Einstein avatar with a placeholder portrait, and Sofia, a fictional character built from an AI-generated photo.
- "Fictional (AI-generated)" consent option. Those avatars are labeled "AI character" instead of "AI recreation".
- Offline backend tests (`tests/test_backend.py`) using fake speech models and a fake Claude.

### Changed
- The UI is now the persona portal. The Gaussian splat viewer and `/asset-proxy` remain in the repo but are unused.
- Replaced the echo placeholder handler and the `useWebRTC` hook with the real conversation loop and `useConversation`.
- `VITE_BACKEND_URL` replaces `VITE_BACKEND_OFFER_URL`.

## [UI Configuration Shell]

### Changed
- Replaced the Detroit-style game menu items with one conversation action and one settings control.
- Added a settings modal for S2S provider, voice, model endpoint, local/remote avatar asset, and rendering quality.
- Connected render quality to Canvas DPR and Gaussian splat viewer options.
- Added explicit splat format detection so local `blob:` uploads can load as `.ksplat`, `.splat`, `.ply`, or `.spz`.
- Added backend asset proxying for remote avatar assets that do not expose browser CORS headers.
- Normalized Hugging Face `/blob/` asset URLs to `/resolve/` download URLs.

## [Runtime and Docs Fixes]

### Changed
- Added explicit local run instructions to `README.md` for both the Python backend and Vite frontend.
- Corrected the frontend description from React/Next.js to the current Vite + React implementation.
- Added `requirements.txt` with the required FastRTC VAD extra.
- Documented the current dependency setup steps for `numpy`, `fastrtc[vad]`, `fastapi`, `httpx`, `uvicorn`, and npm packages.
- Added troubleshooting notes for missing Python modules, Tailwind native binding install issues, microphone permissions, and WebRTC hosting requirements.
- Updated the production direction to reflect the intended Next.js migration, settings modal, GPU backend, S2S model service, and Gaussian avatar animation service.

### Fixed
- Removed unused FastRTC imports that prevented `server.py` from starting with the installed FastRTC package.
- Pointed the browser client at FastRTC's mounted `/webrtc/offer` endpoint instead of the nonexistent `/rtc/offer` route.
- Added CORS support for the local Vite origins.
- Added a local placeholder avatar fallback when no `.splat/.ksplat` URL is configured or the configured asset fails to load.

## [Phase 1 - Scaffold]

### Added
- **UI/UX:** Implemented the initial *Detroit: Become Human*-inspired interface direction.
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
- The frontend is currently Vite + React, not the originally requested Next.js `page.tsx` structure.
