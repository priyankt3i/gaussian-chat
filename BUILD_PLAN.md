# Build Plan to Production

This document outlines the remaining effort required to take this prototype to a production-ready state.

## Phase 2: Animation Engine Integration
*Goal: Connect the WebRTC data channel offsets to the 3D Gaussian Splat renderer.*

1. **Client-Side Buffer Updates:** Modify `SplatViewer.tsx` to receive the `Float32Array` from the WebRTC Data Channel and apply the XYZ offsets directly to the WebGL position buffers of the `DropInViewer` on every animation frame.
2. **Backend Feature Extraction:** Replace the dummy random offset generator in `server.py` with a real `GaussianSpeech` deformation network that extracts Hubert features from the AI audio output and computes accurate coordinate offsets.
3. **Synchronization:** Ensure tight synchronization between the incoming AI audio stream and the WebRTC Data Channel offsets so lip-sync aligns perfectly with the audio playback.

## Phase 3: Audio Brain (S2S) Integration
*Goal: Replace the audio echo with a real Speech-to-Speech model.*

1. **Model Deployment:** Host or integrate a low-latency S2S model like `LLaMA-Omni`.
2. **Inference Loop:** Update the `process_audio` function in `server.py` to stream microphone chunks into the S2S model and stream the generated AI audio chunks back through `fastrtc`.

## Phase 4: Avatar Refinement
*Goal: Load the production avatar and polish the rendering.*

1. **Asset Generation:** Generate or acquire a high-resolution `.splat` file of the target avatar face.
2. **Scene Setup:** Update `SPLAT_URL` in `App.tsx` and adjust camera positioning, FOV, and lighting in `Canvas` to perfectly frame the face.
3. **Performance Tuning:** Optimize the splat renderer settings (e.g., `halfPrecisionCovariancesOnGPU`, worker threads) for maximum framerate and lower latency.

## Phase 5: Production Deployment & Hardening
*Goal: Deploy the architecture to scalable infrastructure.*

1. **TURN Servers:** Replace the public STUN server in `useWebRTC.ts` with dedicated TURN servers (e.g., Twilio Network Traversal) to guarantee connectivity across restricted networks.
2. **Backend Scaling:** Dockerize the Python backend and deploy it to a GPU-accelerated cloud environment capable of running the S2S inference and deformation networks in real-time.
3. **Frontend Hosting:** Deploy the React application to a CDN (e.g., Vercel, Cloudflare Pages).
4. **Error Handling & Reconnection:** Implement robust WebRTC reconnection logic and UI fallback states for network interruptions or latency spikes.
