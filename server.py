import asyncio
import json
import os
from typing import Annotated
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastrtc import ReplyOnPause, Stream
from pydantic import BaseModel

from backend.avatars import KOKORO_VOICES, AvatarStore, AvatarStoreError, ConsentBasis
from backend.conversation import ConversationPipeline, SessionRegistry
from backend.face import FaceEngineError

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", r"^http://(localhost|127\.0\.0\.1):\d+$"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_ASSET_EXTENSIONS = {
    ".ksplat": "application/octet-stream",
    ".splat": "application/octet-stream",
    ".ply": "application/octet-stream",
    ".spz": "application/octet-stream",
}


def normalize_remote_asset_url(url: str) -> str:
    """Convert common web page URLs into direct downloadable asset URLs."""
    if "huggingface.co" in url and "/blob/" in url:
        return url.replace("/blob/", "/resolve/", 1)

    return url


store = AvatarStore()
sessions = SessionRegistry()
pipeline = ConversationPipeline(store, sessions)

# ReplyOnPause runs `respond` whenever the user stops speaking and cancels it as
# soon as they speak again (barge-in). Push-to-talk mutes the mic between presses,
# which the VAD sees as a pause, so both talk modes share this handler.
stream = Stream(
    handler=ReplyOnPause(
        pipeline.respond,
        startup_fn=pipeline.greet,
        can_interrupt=True,
    ),
    modality="audio",
    mode="send-receive",
)

# Mounts POST /webrtc/offer for browser signaling.
stream.mount(app)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Avatar studio: clone a photo + persona into a reusable real-time avatar
# ---------------------------------------------------------------------------


def avatar_payload(avatar) -> dict:
    data = avatar.model_dump(exclude={"persona_prompt"})
    data["portrait_url"] = f"/avatars/{avatar.id}/files/{avatar.portrait}"
    return data


@app.get("/voices")
async def list_voices():
    return [{"id": voice_id, "label": label} for voice_id, label in KOKORO_VOICES.items()]


@app.get("/avatars")
async def list_avatars():
    return [avatar_payload(avatar) for avatar in store.list()]


@app.get("/avatars/{avatar_id}")
async def get_avatar(avatar_id: str):
    try:
        avatar = store.get(avatar_id)
    except AvatarStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return {**avatar_payload(avatar), "persona_prompt": avatar.persona_prompt}


@app.get("/avatars/{avatar_id}/files/{filename}")
async def get_avatar_file(avatar_id: str, filename: str):
    try:
        path = store.file_path(avatar_id, filename)
    except AvatarStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.exists() or path.name == "avatar.json":
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=300"})


@app.post("/avatars", status_code=201)
async def create_avatar(
    name: Annotated[str, Form()],
    persona_prompt: Annotated[str, Form()],
    consent_basis: Annotated[ConsentBasis, Form()],
    portrait: Annotated[UploadFile, File()],
    tagline: Annotated[str, Form()] = "",
    greeting: Annotated[str, Form()] = "",
    voice: Annotated[str, Form()] = "am_michael",
    voice_sample: Annotated[UploadFile | None, File()] = None,
):
    portrait_bytes = await portrait.read()
    voice_sample_bytes = await voice_sample.read() if voice_sample else None
    try:
        avatar = await asyncio.to_thread(
            store.create,
            name=name,
            tagline=tagline,
            persona_prompt=persona_prompt,
            greeting=greeting,
            voice=voice,
            consent_basis=consent_basis,
            portrait_bytes=portrait_bytes,
            voice_sample_bytes=voice_sample_bytes or None,
            voice_sample_filename=voice_sample.filename if voice_sample else None,
        )
    except (AvatarStoreError, FaceEngineError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return avatar_payload(avatar)


@app.delete("/avatars/{avatar_id}", status_code=204)
async def delete_avatar(avatar_id: str):
    try:
        deleted = store.delete(avatar_id)
    except AvatarStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return Response(status_code=204)


class PersonaDraftRequest(BaseModel):
    name: str
    notes: str = ""


@app.post("/avatars/persona-draft")
async def draft_persona(body: PersonaDraftRequest):
    import anthropic

    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    try:
        return await asyncio.to_thread(pipeline.brain.draft_persona, body.name.strip(), body.notes.strip())
    except anthropic.AuthenticationError as exc:
        raise HTTPException(status_code=503, detail="Set ANTHROPIC_API_KEY on the backend to draft personas") from exc
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Claude request failed: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Talk: bind a WebRTC call to an avatar and stream live captions
# ---------------------------------------------------------------------------


class SessionRequest(BaseModel):
    webrtc_id: str
    avatar_id: str


@app.post("/sessions", status_code=201)
async def create_session(body: SessionRequest):
    """Called by the browser right before the WebRTC offer, with the same webrtc_id."""
    try:
        avatar = store.get(body.avatar_id)
    except AvatarStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    sessions.register(body.webrtc_id, avatar.id)
    return {"webrtc_id": body.webrtc_id, "avatar_id": avatar.id}


@app.delete("/sessions/{webrtc_id}", status_code=204)
async def end_session(webrtc_id: str):
    sessions.drop(webrtc_id)
    return Response(status_code=204)


@app.get("/sessions/{webrtc_id}/captions")
async def stream_captions(webrtc_id: str):
    """Server-sent events with the user's transcript and the avatar's reply text."""
    if sessions.get(webrtc_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")

    async def events():
        # FastRTC keys output queues by webrtc_id, so subscribing before the offer is fine.
        async for output in stream.output_stream(webrtc_id):
            yield f"data: {json.dumps(output.args[0])}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/asset-proxy/{filename}")
async def proxy_asset(filename: str, url: str = Query(...)):
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in SUPPORTED_ASSET_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported asset extension")

    normalized_url = normalize_remote_asset_url(url)
    parsed_url = urlparse(normalized_url)
    if parsed_url.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https asset URLs can be proxied")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=120) as client:
            upstream_response = await client.get(normalized_url)
            upstream_response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Could not fetch remote asset: {exc.response.reason_phrase}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch remote asset: {exc}") from exc

    return Response(
        content=upstream_response.content,
        media_type=SUPPORTED_ASSET_EXTENSIONS[suffix],
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@app.on_event("startup")
async def startup_event():
    if os.environ.get("SKIP_MODEL_WARMUP") != "1":
        # Downloads and loads the speech-to-text and text-to-speech models once.
        await asyncio.to_thread(pipeline.warm_up)
    print("Persona avatar server started. Listening for connections...")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
