# Persona Portal (gaussian-chat)

Clone a photo into a real-time AI avatar, then have a live voice conversation with it. Think "talk to Albert Einstein": you speak, the avatar answers in character with a voice and an animated face, and you can interrupt it at any time.

The app has two parts:

1. **Avatar Studio:** upload a portrait, write (or let Claude draft) a persona, pick a voice, and record who the person is (consent). The photo is prepared once by the face engine and saved as a reusable avatar.
2. **Talk:** pick any avatar from the gallery and talk in one of two modes:
   - **Always listening:** voice activity detection decides when you've finished a sentence. Speaking while the avatar talks interrupts it.
   - **Push to talk:** hold the button (or Space) while you speak and release to send. Pressing it while the avatar is talking cuts it off.

## How it works

```
Browser mic ──WebRTC──▶ FastRTC VAD ──▶ speech-to-text ──▶ Claude (in character, streaming)
     ▲                                                        │ sentence by sentence
     └──────────── WebRTC audio ◀── text-to-speech ◀──────────┘
     └──────────── live captions (server-sent events)
```

- **Transport and turn-taking:** [FastRTC](https://fastrtc.org) `ReplyOnPause` with `can_interrupt=True`. Push-to-talk mutes the mic track between presses, so the release reads as a pause and both modes share one server handler.
- **Speech-to-text:** Moonshine (FastRTC built-in, runs on CPU).
- **Brain:** Claude through the Anthropic SDK, streamed so the avatar starts speaking after the first sentence. History is kept per call. When you interrupt, only the part that was actually spoken is remembered.
- **Voice:** Kokoro (FastRTC built-in, runs on CPU) with a preset voice per avatar. A voice sample can be stored with each avatar for a future voice-cloning engine.
- **Face:** the `portrait` face engine. The browser animates the cloned photo from the avatar's live voice level (breathing, head motion, speaking glow). This is a stand-in; see *Roadmap*.

## Run locally

Use two terminals from the repo root.

### 1. Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...   # or sign in once with `ant auth login`
python server.py
```

The backend runs on `http://localhost:8000`. On first start it downloads the VAD, speech-to-text and text-to-speech models (a few hundred MB), so the first launch takes a while.

Optional settings:

| Variable | Default | Purpose |
|---|---|---|
| `AVATAR_CLAUDE_MODEL` | `claude-opus-5-5` | Model that plays the persona |
| `AVATAR_CLAUDE_EFFORT` | `low` | Thinking effort. Low keeps the time to first word short |
| `AVATAR_DATA_DIR` | `data/avatars` | Where cloned avatars are stored |
| `CORS_ORIGIN_REGEX` | localhost only | Allowed frontend origins |

Persona replies use the `server-side-fallback-2026-07-01` beta (`fallbacks: "default"`), so a request the model declines is retried on Anthropic's recommended fallback model instead of failing the turn.

### 2. Frontend

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Set `VITE_BACKEND_URL` if the backend is not on port 8000 of the same host.

### Tests

```bash
pip install -r requirements-dev.txt
pytest
npm run lint && npm run build
```

The backend tests use fake speech models and a fake Claude, so they run offline and cost nothing.

## Avatars and consent

- Avatars live in `data/avatars/<id>/` (`avatar.json`, `portrait.png`, optional voice sample). Only the built-in Albert Einstein avatar is committed. Avatars you create in the Studio stay local.
- The Einstein avatar ships with a drawn placeholder portrait. For a realistic face, create a new avatar in the Studio with a public-domain photo, such as Ferdinand Schmutzer's 1921 portrait on Wikimedia Commons.
- Every avatar records a consent basis: a historical figure, yourself, or someone who gave written permission. The call screen labels every avatar as an **AI recreation**.
- Names and likenesses of famous people can be legally protected even after death (Einstein's are licensed by the Hebrew University of Jerusalem). Personal and educational use is low risk. Get rights or legal advice before a commercial launch.

## Roadmap

1. **Neural face engine.** Replace the portrait engine with a real-time talking-head model that animates a single photo, such as Ditto. It plugs into `backend/face.py`: `prepare()` precomputes the source features when an avatar is cloned, and with `renders_video = True` the FastRTC stream switches to `audio-video` so the server sends frames driven by the same TTS audio. `LiveFace.tsx` then shows the video track instead of the still image. This needs an NVIDIA GPU.
2. **Voice cloning.** Swap Kokoro for a cloning TTS (CosyVoice, F5-TTS or GPT-SoVITS) that uses each avatar's stored voice sample. Check each model's license.
3. **Production hardening.** TURN servers, authentication, per-user avatar storage, rate limits, and GPU hosting. See `BUILD_PLAN.md`.

The earlier Gaussian-splat viewer (`src/components/SplatViewer.tsx`) and the `/asset-proxy` endpoint are kept for a later 3D avatar mode but are not used by the current UI.

## Troubleshooting

- If the frontend fails with `Cannot find native binding`, rerun `npm ci`. This restores Tailwind's optional native package.
- If the backend fails with `ModuleNotFoundError`, activate `.venv` and run `pip install -r requirements.txt`.
- Model downloads come from Hugging Face and GitHub on first start. If they are slow or rate-limited, set `HF_TOKEN`.
- Without Anthropic credentials, **Draft personality** returns 503, and during a call the transcript shows "The avatar could not answer" with the error.
- In always-listening mode, use headphones if the avatar keeps interrupting itself. Browser echo cancellation helps, but speakers next to the mic can still trigger barge-in.
- Microphone access only works on `localhost` or HTTPS.
- Outside local development, WebRTC needs TURN credentials, not only public STUN.
- The `onnxruntime` PCI warning and the FastAPI `on_event` deprecation warning are harmless.
