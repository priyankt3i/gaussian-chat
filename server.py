import asyncio
from urllib.parse import urlparse

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastrtc import (
    Stream,
    ReplyOnPause
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
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

# ---------------------------------------------------------------------------
# Phase 1: Infrastructure & Data Loop
# ---------------------------------------------------------------------------
# In the full GaussianSpeech architecture, LLaMA-Omni (or similar S2S model)
# will receive audio, and the acoustic features (Hubert) will be extracted 
# to calculate 3D Gaussian position and rotation offsets.
#
# For this Phase 1 scaffold, we implement the WebRTC loop:
# 1. Receive incoming microphone audio chunks.
# 2. Echo the audio back (placeholder for S2S inference).
# 3. Generate dummy Float32Array coordinate offsets for the future animation
#    stream. These are not wired to a WebSocket/Data Channel yet.
# ---------------------------------------------------------------------------

async def process_audio(audio_chunk: tuple[int, np.ndarray]):
    """
    Placeholder for the Audio Brain (LLaMA-Omni).
    Currently just echoes the received audio chunk back.
    
    Args:
        audio_chunk: A tuple of (sample_rate, audio_data_array)
    Returns:
        The generated AI audio chunk.
    """
    sample_rate, data = audio_chunk
    
    # TODO: Inject S2S inference here (e.g., LLaMA-Omni)
    # ai_audio = llama_omni_inference(data)
    
    return sample_rate, data

async def generate_gaussian_offsets():
    """
    Placeholder for the Animation Engine (GaussianSpeech).
    In production, this calculates offsets from Hubert features.
    For now, it generates random XYZ offsets and sends them to the client.
    """
    while True:
        # Generate random offsets for testing (e.g., for 1000 splats)
        num_splats = 1000
        # Format: Float32Array [x1, y1, z1, x2, y2, z2, ...]
        offsets = np.random.uniform(-0.01, 0.01, num_splats * 3).astype(np.float32)
        
        # In a real implementation with fastrtc, you might use a custom websocket
        # or the WebRTC data channel if fastrtc exposes it.
        # fastrtc stream currently focuses on Audio/Video tracks.
        # We simulate the async data generation here.
        await asyncio.sleep(0.033) # ~30fps

# Setup fastrtc Stream
# We use ReplyOnPause to handle continuous audio input and generate a response
# when the user pauses.
stream = Stream(
    handler=ReplyOnPause(process_audio),
    modality="audio",
    mode="send-receive"
)

# Mount the fastrtc stream to the FastAPI app
# This handles the WebRTC signaling via /rtc endpoint
stream.mount(app)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

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
    # Start the data channel generation task (mock)
    # In a full implementation, this data would be synchronized with the audio output
    asyncio.create_task(generate_gaussian_offsets())
    print("Gaussian S2S FastRTC server started. Listening for connections...")

if __name__ == "__main__":
    import uvicorn
    # Note: To run this, you need fastrtc, fastapi, uvicorn installed
    uvicorn.run(app, host="0.0.0.0", port=8000)
