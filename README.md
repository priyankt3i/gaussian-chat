# Gaussian S2S Portal

A decoupled WebRTC prototype for a real-time Speech-to-Speech (S2S) 3D Gaussian Splatting avatar, inspired by the minimal menu language of *Detroit: Become Human*.

## Current Status

This repo is a scaffold, not a production-ready avatar system yet.

- **Frontend:** Vite + React + Three.js using `@react-three/fiber` and `@mkkellogg/gaussian-splats-3d`.
- **Backend:** FastAPI + FastRTC-shaped Python server.
- **Audio:** Placeholder echo loop only. LLaMA-Omni is not integrated.
- **Animation:** Random Gaussian offset generation exists in Python, but it is not yet streamed to the browser or applied to the splat buffers.
- **UI:** Minimal avatar conversation shell with one settings modal for model, voice, avatar asset, and render quality.

## Run Locally

Use two terminals from the repo root.

### 1. Backend

```bash
cd /workspaces/gaussian-chat
python -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" httpx numpy "fastrtc[vad]"
python server.py
```

Or install from the project dependency file:

```bash
pip install -r requirements.txt
python server.py
```

The backend runs on:

```text
http://localhost:8000
```

The current client expects the FastRTC offer endpoint at:

```text
http://localhost:8000/webrtc/offer
```

### 2. Frontend

```bash
cd /workspaces/gaussian-chat
npm ci
npm run dev
```

Open:

```text
http://localhost:3000
```

Click **Start Conversation** to request microphone access and attempt the WebRTC connection. Use **Settings** to configure the model endpoint, voice, avatar asset, and render quality.

Optional frontend overrides:

```bash
VITE_BACKEND_OFFER_URL="http://localhost:8000/webrtc/offer"
VITE_SPLAT_URL="https://your-host/avatar.ksplat"
```

If `VITE_SPLAT_URL` is unset or fails to load, the app shows a local placeholder avatar so the UI can still run.
Remote avatar URLs are loaded through the Python backend proxy to avoid browser CORS failures. Hugging Face `/blob/` URLs are automatically rewritten to `/resolve/` URLs before proxying.

## Troubleshooting

- If the frontend fails with `Cannot find native binding`, rerun `npm ci`. This restores Tailwind's optional native package.
- If the backend fails with `ModuleNotFoundError`, activate `.venv` and reinstall the Python packages above.
- If the backend says `Install fastrtc[vad] to use ReplyOnPause`, run `pip install -r requirements.txt`.
- On first backend startup, FastRTC downloads a Silero VAD model from Hugging Face. If the download is slow or rate-limited, set `HF_TOKEN` in your environment.
- The `onnxruntime` PCI warning and FastAPI `on_event` deprecation warning are currently non-blocking.
- If a remote `.ksplat/.splat/.ply/.spz` URL does not load, make sure the backend is running; the frontend uses `/asset-proxy/...` on the backend for those assets.
- If microphone access fails, use `localhost` or HTTPS. Browsers generally block mic access on insecure origins.
- If WebRTC connects unreliably outside local development, production needs TURN credentials instead of only public STUN.

## Production Direction

The intended production architecture is:

1. **Next.js portal:** Minimal chatbot UI centered around the avatar face, plus a settings modal for model/provider, `.splat/.ksplat` source, render quality, backend URL, and audio devices.
2. **Realtime backend:** FastAPI/FastRTC service for raw audio in, generated audio out, session state, and TURN-aware signaling.
3. **S2S model service:** Native audio-to-audio model such as LLaMA-Omni or a licensed replacement.
4. **Avatar animation service:** GaussianSpeech/GaussianTalker-style model producing synchronized facial motion or rendered avatar frames.
5. **Deployment:** Split hosting, with the frontend on web hosting and the Python/model backend on a GPU-capable container host.

See `BUILD_PLAN.md` for the production roadmap.
