"""File-backed store for cloned avatars.

Each avatar lives in its own folder under `AVATAR_DATA_DIR`:

    data/avatars/<avatar-id>/
        avatar.json        # persona, voice, and consent metadata
        portrait.png       # prepared by the face engine (or portrait.svg for seeds)
        voice-sample.*     # optional reference audio for a future voice-cloning TTS
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .face import FaceEngineError, get_face_engine

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "avatars"

# Kokoro voices bundled with FastRTC's default TTS. A voice-cloning TTS would use
# the avatar's voice sample instead.
KOKORO_VOICES = {
    "am_michael": "American male, warm",
    "am_adam": "American male, deep",
    "bm_george": "British male, mature",
    "bm_lewis": "British male, measured",
    "af_heart": "American female, warm",
    "af_bella": "American female, bright",
    "bf_emma": "British female, calm",
    "bf_isabella": "British female, crisp",
}

ConsentBasis = Literal["historical_figure", "myself", "documented_consent", "ai_generated"]

MAX_VOICE_SAMPLE_BYTES = 10 * 1024 * 1024
VOICE_SAMPLE_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm"}


class Avatar(BaseModel):
    id: str
    name: str
    tagline: str = ""
    persona_prompt: str
    greeting: str = ""
    voice: str = "am_michael"
    voice_speed: float = Field(default=1.0, ge=0.5, le=1.5)
    portrait: str
    voice_sample: str | None = None
    face_engine: str = "portrait"
    consent_basis: ConsentBasis
    created_at: float = Field(default_factory=time.time)
    seed: bool = False


class AvatarStoreError(ValueError):
    pass


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:48] or "avatar"


class AvatarStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root or os.environ.get("AVATAR_DATA_DIR") or DEFAULT_DATA_DIR)
        self.root.mkdir(parents=True, exist_ok=True)

    def _dir(self, avatar_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9-]{1,64}", avatar_id):
            raise AvatarStoreError("Invalid avatar id")
        return self.root / avatar_id

    def list(self) -> list[Avatar]:
        avatars = []
        for meta in sorted(self.root.glob("*/avatar.json")):
            try:
                avatars.append(Avatar.model_validate_json(meta.read_text()))
            except ValueError:
                continue
        return sorted(avatars, key=lambda avatar: (not avatar.seed, -avatar.created_at))

    def get(self, avatar_id: str) -> Avatar | None:
        meta = self._dir(avatar_id) / "avatar.json"
        if not meta.exists():
            return None
        return Avatar.model_validate_json(meta.read_text())

    def file_path(self, avatar_id: str, filename: str) -> Path:
        path = (self._dir(avatar_id) / filename).resolve()
        if path.parent != self._dir(avatar_id).resolve():
            raise AvatarStoreError("Invalid file name")
        return path

    def create(
        self,
        *,
        name: str,
        tagline: str,
        persona_prompt: str,
        greeting: str,
        voice: str,
        consent_basis: ConsentBasis,
        portrait_bytes: bytes,
        voice_sample_bytes: bytes | None = None,
        voice_sample_filename: str | None = None,
    ) -> Avatar:
        name = name.strip()
        if not name:
            raise AvatarStoreError("Name is required")
        if not persona_prompt.strip():
            raise AvatarStoreError("Persona prompt is required")
        if voice not in KOKORO_VOICES:
            raise AvatarStoreError(f"Unknown voice '{voice}'")

        avatar_id = f"{slugify(name)}-{uuid.uuid4().hex[:6]}"
        avatar_dir = self._dir(avatar_id)
        avatar_dir.mkdir(parents=True)

        try:
            portrait = get_face_engine().prepare(portrait_bytes, avatar_dir)

            voice_sample = None
            if voice_sample_bytes:
                suffix = Path(voice_sample_filename or "").suffix.lower()
                if suffix not in VOICE_SAMPLE_EXTENSIONS:
                    raise AvatarStoreError("Voice sample must be WAV, MP3, M4A, OGG, or WebM audio")
                if len(voice_sample_bytes) > MAX_VOICE_SAMPLE_BYTES:
                    raise AvatarStoreError("Voice sample must be 10 MB or smaller")
                voice_sample = f"voice-sample{suffix}"
                (avatar_dir / voice_sample).write_bytes(voice_sample_bytes)

            avatar = Avatar(
                id=avatar_id,
                name=name,
                tagline=tagline.strip(),
                persona_prompt=persona_prompt.strip(),
                greeting=greeting.strip(),
                voice=voice,
                portrait=portrait,
                voice_sample=voice_sample,
                consent_basis=consent_basis,
            )
            (avatar_dir / "avatar.json").write_text(json.dumps(avatar.model_dump(), indent=2))
            return avatar
        except (FaceEngineError, AvatarStoreError):
            shutil.rmtree(avatar_dir, ignore_errors=True)
            raise

    def delete(self, avatar_id: str) -> bool:
        avatar = self.get(avatar_id)
        if avatar is None:
            return False
        if avatar.seed:
            raise AvatarStoreError("Built-in avatars cannot be deleted")
        shutil.rmtree(self._dir(avatar_id))
        return True
