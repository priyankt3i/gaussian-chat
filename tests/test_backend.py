import io
import json
import os
import shutil
from pathlib import Path

import numpy as np
import pytest
from fastrtc.utils import Context, current_context
from PIL import Image

os.environ["SKIP_MODEL_WARMUP"] = "1"

from backend.avatars import AvatarStore, AvatarStoreError  # noqa: E402
from backend.conversation import (  # noqa: E402
    INTERRUPTED_MARKER,
    ConversationPipeline,
    SessionRegistry,
    split_sentences,
)

SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "avatars" / "albert-einstein"


def png_bytes(size=(1200, 900)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (200, 180, 160)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def store(tmp_path):
    shutil.copytree(SEED_DIR, tmp_path / "albert-einstein")
    return AvatarStore(tmp_path)


class FakeSTT:
    def __init__(self, text):
        self.text = text

    def stt(self, audio):
        return self.text


class FakeTTS:
    def __init__(self):
        self.spoken = []

    def stream_tts_sync(self, text, options=None):
        self.spoken.append((text, options.voice))
        yield 24000, np.zeros(240, dtype=np.float32)


class FakeReply:
    def __init__(self, deltas, refused=False):
        self.deltas = deltas
        self._refused = refused
        self.finished = False

    def text_stream(self):
        yield from self.deltas
        self.finished = True

    def final_content(self):
        if not self.finished:
            return None
        return [{"type": "thinking", "thinking": "", "signature": "sig"}, {"type": "text", "text": "".join(self.deltas)}]

    def refused(self):
        return self._refused


class FakeBrain:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def stream_reply(self, avatar, history):
        self.calls.append((avatar.id, list(history)))
        return self.reply


def make_pipeline(store, reply, user_text="What is relativity?"):
    sessions = SessionRegistry()
    tts = FakeTTS()
    brain = FakeBrain(reply)
    pipeline = ConversationPipeline(store, sessions, brain=brain, stt=FakeSTT(user_text), tts=tts)
    sessions.register("call-1", "albert-einstein")
    current_context.set(Context(webrtc_id="call-1"))
    return pipeline, sessions.get("call-1"), tts, brain


def outputs(items):
    return [item.args[0] for item in items if hasattr(item, "args")]


def audio_chunks(items):
    return [item for item in items if isinstance(item, tuple)]


def test_split_sentences_groups_streamed_text():
    deltas = ["Ja, time", " is relative. It depends", " on how fast you move! And", " gravity bends it too"]
    assert list(split_sentences(deltas)) == [
        "Ja, time is relative.",
        "It depends on how fast you move!",
        "And gravity bends it too",
    ]


def test_split_sentences_keeps_short_fragments_together():
    assert list(split_sentences(["Ah. Yes. ", "That is a wonderful question."])) == [
        "Ah. Yes. That is a wonderful question."
    ]


def test_seed_avatar_loads(store):
    avatars = store.list()
    assert [avatar.id for avatar in avatars] == ["albert-einstein"]
    assert avatars[0].seed and avatars[0].voice == "bm_george"


def test_create_avatar_prepares_square_portrait(store):
    avatar = store.create(
        name="Marie Curie",
        tagline="Physicist and chemist",
        persona_prompt="You are Marie Curie.",
        greeting="Bonjour.",
        voice="bf_emma",
        consent_basis="historical_figure",
        portrait_bytes=png_bytes(),
    )
    assert avatar.id.startswith("marie-curie-")
    with Image.open(store.file_path(avatar.id, avatar.portrait)) as image:
        assert image.size == (768, 768)
    assert store.get(avatar.id).name == "Marie Curie"
    assert store.delete(avatar.id)
    assert store.get(avatar.id) is None


def test_create_avatar_rejects_bad_input_and_cleans_up(store, tmp_path):
    with pytest.raises(ValueError):
        store.create(
            name="Nobody", tagline="", persona_prompt="You are nobody.", greeting="", voice="am_michael",
            consent_basis="myself", portrait_bytes=b"not an image",
        )
    with pytest.raises(AvatarStoreError):
        store.create(
            name="Nobody", tagline="", persona_prompt="You are nobody.", greeting="", voice="robot",
            consent_basis="myself", portrait_bytes=png_bytes(),
        )
    assert [path.name for path in tmp_path.iterdir()] == ["albert-einstein"]


def test_seed_avatar_cannot_be_deleted(store):
    with pytest.raises(AvatarStoreError):
        store.delete("albert-einstein")


def test_file_path_rejects_traversal(store):
    with pytest.raises(AvatarStoreError):
        store.file_path("albert-einstein", "../../etc/passwd")
    with pytest.raises(AvatarStoreError):
        store.file_path("../secret", "portrait.svg")


def test_greeting_is_spoken_and_recorded(store):
    pipeline, session, tts, _ = make_pipeline(store, FakeReply([]))
    items = list(pipeline.greet())
    assert outputs(items)[0]["text"].startswith("Ah, hello!")
    assert tts.spoken[0][1] == "bm_george"
    assert [message["role"] for message in session.history] == ["user", "assistant"]


def test_full_reply_streams_captions_audio_and_keeps_content(store):
    reply = FakeReply(["Imagine riding on a beam", " of light. What would you see?"])
    pipeline, session, tts, brain = make_pipeline(store, reply)

    items = list(pipeline.respond((48000, np.zeros((1, 4800), dtype=np.int16))))

    captions = outputs(items)
    assert captions[0] == {"role": "user", "text": "What is relativity?", "turn": 1, "final": True}
    assert captions[-1]["final"] and captions[-1]["text"] == "Imagine riding on a beam of light. What would you see?"
    assert len(audio_chunks(items)) == 2
    assert brain.calls[0][1] == [{"role": "user", "content": "What is relativity?"}]
    # The full content (including thinking blocks) is replayed on the next turn.
    assert session.history[-1]["content"][0]["type"] == "thinking"


def test_interrupted_reply_keeps_only_what_was_said(store):
    reply = FakeReply(["Time slows down when you move fast.", " And there is much more", " to say about it."])
    pipeline, session, tts, _ = make_pipeline(store, reply)

    generator = pipeline.respond((48000, np.zeros((1, 4800), dtype=np.int16)))
    for item in generator:
        if isinstance(item, tuple):
            break  # first audio chunk is playing when the user barges in
    generator.close()

    assert session.history[-1] == {
        "role": "assistant",
        "content": [{"type": "text", "text": "Time slows down when you move fast." + INTERRUPTED_MARKER}],
    }


def test_silence_produces_no_turn(store):
    pipeline, session, tts, brain = make_pipeline(store, FakeReply(["Hi."]), user_text="  ")
    assert list(pipeline.respond((48000, np.zeros((1, 10), dtype=np.int16)))) == []
    assert session.history == [] and brain.calls == []


def test_refusal_speaks_a_deflection(store):
    pipeline, session, tts, _ = make_pipeline(store, FakeReply([], refused=True))
    items = list(pipeline.respond((48000, np.zeros((1, 10), dtype=np.int16))))
    assert outputs(items)[-1]["text"].startswith("I would rather not")
    assert session.history[-1]["content"][0]["text"].startswith("I would rather not")


def test_claude_error_is_reported_and_call_survives(store):
    class FailingReply(FakeReply):
        def text_stream(self):
            raise RuntimeError("authentication failed")
            yield

    pipeline, session, tts, _ = make_pipeline(store, FailingReply([]))
    items = list(pipeline.respond((48000, np.zeros((1, 10), dtype=np.int16))))
    assert outputs(items)[-1]["role"] == "system"
    assert "authentication failed" in outputs(items)[-1]["text"]
    assert [message["role"] for message in session.history] == ["user"]


def test_unknown_session_is_ignored(store):
    pipeline, _, _, brain = make_pipeline(store, FakeReply(["Hi."]))
    current_context.set(Context(webrtc_id="someone-else"))
    assert list(pipeline.respond((48000, np.zeros((1, 10), dtype=np.int16)))) == []
    assert brain.calls == []


def test_http_api(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    shutil.copytree(SEED_DIR, tmp_path / "albert-einstein")
    # Building the FastRTC stream loads the VAD model; the HTTP routes don't need it.
    import fastrtc.reply_on_pause

    monkeypatch.setattr(fastrtc.reply_on_pause, "get_silero_model", lambda: object())
    import server

    monkeypatch.setattr(server, "store", AvatarStore(tmp_path))
    client = TestClient(server.app)

    avatars = client.get("/avatars").json()
    assert avatars[0]["id"] == "albert-einstein" and "persona_prompt" not in avatars[0]
    assert client.get(avatars[0]["portrait_url"]).status_code == 200
    assert client.get("/avatars/albert-einstein/files/avatar.json").status_code == 404

    created = client.post(
        "/avatars",
        data={"name": "Ada Lovelace", "persona_prompt": "You are Ada.", "consent_basis": "historical_figure", "voice": "bf_emma"},
        files={"portrait": ("ada.png", png_bytes(), "image/png")},
    )
    assert created.status_code == 201, created.text
    avatar_id = created.json()["id"]

    missing_consent = client.post(
        "/avatars",
        data={"name": "X", "persona_prompt": "You are X.", "consent_basis": "just_because"},
        files={"portrait": ("x.png", png_bytes(), "image/png")},
    )
    assert missing_consent.status_code == 422

    session = client.post("/sessions", json={"webrtc_id": "abc", "avatar_id": avatar_id})
    assert session.status_code == 201
    assert client.post("/sessions", json={"webrtc_id": "abc", "avatar_id": "nope"}).status_code == 404
    assert client.delete(f"/avatars/{avatar_id}").status_code == 204
    assert client.delete("/avatars/albert-einstein").status_code == 400
    assert json.loads(json.dumps(client.get("/voices").json()))[0]["id"] == "am_michael"
