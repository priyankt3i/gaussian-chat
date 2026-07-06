# Build Plan to Production

This document tracks the work needed to move the current scaffold into a production-ready S2S Gaussian avatar portal.

## Phase 0: Make the Current Scaffold Honest and Runnable
*Goal: Ensure a new developer can run the current prototype and understand what is real versus mocked.*

1. **Local Run Documentation:** Keep `README.md` current with the two-terminal backend/frontend run flow.
2. **Dependency Management:** Maintain `requirements.txt` for `fastapi`, `fastrtc[vad]`, `uvicorn`, and `numpy`; keep npm installs reproducible with `package-lock.json`.
3. **Environment Setup:** Add documented `.env` keys for backend URL, frontend origin, TURN settings, splat URL, and model provider.
4. **Verification:** Confirm `npm run lint`, `npm run build`, Python imports, and `python server.py` work from a clean checkout.

## Phase 1: Correct the Product Shell
*Goal: Replace the decorative game menu mock with the intended avatar conversation portal.*

1. **Next.js Migration:** Move the frontend from Vite + React into a Next.js app structure with an `app/page.tsx` entrypoint.
2. **Minimal Chatbot UI:** Center the avatar face as the primary first-screen object; expose a single `Start Conversation` control and live session status.
3. **Settings Modal:** Add configuration for S2S provider, model endpoint, `.splat/.ksplat` source, render quality, backend URL, TURN mode, microphone device, speaker device, and debug overlay.
4. **Responsive Polish:** Keep the Detroit-inspired clean blue-white visual language without the unrelated game buttons, extras menu, or "return to desktop" affordance.

## Phase 2: Real Realtime Transport
*Goal: Implement the raw audio and animation data loop that the scaffold currently only suggests.*

1. **FastRTC Audio Loop:** Replace pause-triggered echo behavior with a streaming path that supports raw microphone audio in and generated audio out.
2. **Signaling Contract:** Document and test the exact FastRTC signaling endpoint used by the browser client.
3. **Animation Channel:** Implement either a WebRTC Data Channel or WebSocket stream for binary animation packets.
4. **Packet Format:** Send sequence number, presentation timestamp, payload type, and `Float32Array` payload for offsets or facial coefficients.
5. **Frontend Consumption:** Convert incoming binary packets to typed arrays, buffer by timestamp, drop stale packets, and expose the latest frame to the renderer.
6. **Cleanup:** Ensure disconnect and component unmount close peer connections, stop mic tracks, close data channels/sockets, release audio elements, and cancel animation tasks.

## Phase 3: Avatar Rendering and Animation
*Goal: Move from static splat loading to synchronized avatar motion.*

1. **Static Avatar Asset:** Replace the remote garden demo with a real face/avatar `.splat` or `.ksplat` asset and local fallback.
2. **Renderer Adapter:** Prove whether `@mkkellogg/gaussian-splats-3d` can safely accept per-frame client-side deformation for the required splat count.
3. **Backend Render Fallback:** If direct browser splat deformation is unstable, stream GPU-rendered avatar video from the backend while keeping the frontend splat viewer for standby/configuration.
4. **Gaussian Animation Service:** Integrate GaussianSpeech/GaussianTalker-style inference to produce synchronized motion from outgoing AI audio.
5. **Sync:** Align AI audio playback and avatar motion using timestamps rather than arrival order.

## Phase 4: Native S2S Model Integration
*Goal: Replace echo audio with a native audio-in/audio-out model, not STT to LLM to TTS.*

1. **Provider Interface:** Define `MockS2SProvider`, `LlamaOmniProvider`, and a swappable provider contract for licensed alternatives.
2. **Streaming Inference:** Feed microphone chunks into the S2S provider and stream generated audio chunks back through the realtime transport.
3. **Model Constraints:** Document licensing and deployment limitations for research models such as LLaMA-Omni before public or commercial use.
4. **Latency Metrics:** Track mic-to-model, model-to-audio, model-to-animation, and end-to-end latency in the debug overlay.

## Phase 5: Production Deployment and Hardening
*Goal: Deploy the frontend and GPU backend with reliable networking, observability, and rollback.*

1. **Split Hosting:** Deploy the frontend to web hosting and the Python/model backend to a GPU-capable container host.
2. **Containers:** Add Dockerfiles and `docker-compose` for local full-stack testing.
3. **TURN:** Replace public STUN-only config with production TURN credentials.
4. **Security:** Lock CORS origins, protect model endpoints, keep secrets out of the client bundle, and add basic session/auth controls if exposed publicly.
5. **Observability:** Add structured logs, health checks, model readiness checks, WebRTC connection metrics, and latency reporting.
6. **Acceptance Tests:** Require clean frontend build, backend import/start checks, WebRTC smoke test, mock-audio roundtrip, animation packet test, and browser UI smoke test before release.
