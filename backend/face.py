"""Face engines turn an uploaded photo into something that can be animated live.

The prototype ships `PortraitFaceEngine`, which normalizes the photo and lets the
browser animate it from the avatar's audio level. A neural engine (for example
Ditto, which drives a talking head from a single image in real time) slots in
behind the same interface:

- `prepare()` runs once when an avatar is cloned. A neural engine would extract
  and cache the source-image features here so live sessions start instantly.
- `renders_video` tells the server whether to stream video frames. When an engine
  renders server-side, the FastRTC stream switches to `audio-video` modality and
  the engine produces frames from the same TTS audio that is sent to the browser.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PORTRAIT_BYTES = 8 * 1024 * 1024
PORTRAIT_SIZE = 768


class FaceEngineError(ValueError):
    pass


class PortraitFaceEngine:
    name = "portrait"
    renders_video = False

    def prepare(self, image_bytes: bytes, avatar_dir: Path) -> str:
        """Validate the upload, square-crop it around the upper center, and save a PNG."""
        if len(image_bytes) > MAX_PORTRAIT_BYTES:
            raise FaceEngineError("Portrait must be 8 MB or smaller")

        try:
            image = Image.open(io.BytesIO(image_bytes))
            image.load()
        except (UnidentifiedImageError, OSError) as exc:
            raise FaceEngineError("Portrait must be a JPEG, PNG, or WebP image") from exc

        image = ImageOps.exif_transpose(image).convert("RGB")
        # Faces usually sit in the upper half of a portrait, so bias the crop upward.
        image = ImageOps.fit(image, (PORTRAIT_SIZE, PORTRAIT_SIZE), method=Image.Resampling.LANCZOS, centering=(0.5, 0.35))

        filename = "portrait.png"
        image.save(avatar_dir / filename, format="PNG", optimize=True)
        return filename


def get_face_engine() -> PortraitFaceEngine:
    return PortraitFaceEngine()
