# Gaussian S2S Portal

A decoupled, real-time WebRTC 3D Gaussian Splatting interface designed for Speech-to-Speech (S2S) avatars, inspired by the minimalist, diegetic UI of *Detroit: Become Human*.

## Architecture

This portal is designed to connect a high-performance web frontend with a backend audio and animation engine.

1. **Frontend:** React + Three.js (`@react-three/fiber`) rendering a 3D Gaussian Splat using `@mkkellogg/gaussian-splats-3d`.
2. **Transport:** WebRTC via Hugging Face `fastrtc` for sub-500ms latency bidirectional audio and data streams.
3. **Audio Brain (Backend):** Speech-to-Speech model (e.g., LLaMA-Omni) handling native audio-in to audio-out.
4. **Animation Engine (Backend):** `GaussianSpeech` architecture extracting Hubert features to calculate 3D Gaussian position and rotation offsets, streamed via WebRTC Data Channels.

## Usage

### Frontend (React/Next.js)

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Navigate to the application URL.
4. Click on **CONTINUE** to initialize the WebRTC connection and start the microphone stream.

### Backend (Python/FastRTC)

1. Ensure Python dependencies are installed (`fastapi`, `fastrtc`, `uvicorn`, `numpy`).
2. Run the server: `python server.py`
3. The server runs on `localhost:8000` and exposes the `/rtc/offer` endpoint for signaling.

*Note: The current backend is a scaffolded mock. It echoes audio and generates random coordinate offsets for testing.*
