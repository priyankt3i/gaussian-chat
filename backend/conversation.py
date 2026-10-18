"""Real-time voice loop: speech-to-text -> Claude in character -> text-to-speech.

FastRTC's `ReplyOnPause` calls `respond()` each time the user stops talking and
stops the generator as soon as the user starts talking again, which is how
interruptions work. Push-to-talk uses the same path: the browser only enables
the microphone while the button is held, so releasing it reads as a pause.
"""

from __future__ import annotations

import logging
import os
import re
import threading
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np
from fastrtc import AdditionalOutputs, KokoroTTSOptions, get_current_context

from .avatars import Avatar, AvatarStore

logger = logging.getLogger(__name__)

DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"

VOICE_RULES = """You are speaking out loud in a live, real-time voice conversation through a talking avatar.
- Answer in one to three short spoken sentences unless the user asks you to go deeper.
- Write plain spoken words only: no markdown, lists, emoji, stage directions, or text in asterisks.
- The user can interrupt you at any time. If their message changes direction, follow it without recapping.
- Stay in character. If you are sincerely asked whether you are an AI, say you are an AI recreation of {name}, then carry on in character.
- Latency-sensitive; begin your visible answer immediately."""

INTERRUPTED_MARKER = " [interrupted by the user]"

_SENTENCE_END = re.compile(r"[.!?;:](?=\s)|\n")
_MIN_SENTENCE_CHARS = 16


class SpeechToText(Protocol):
    def stt(self, audio: tuple[int, np.ndarray]) -> str: ...


class TextToSpeech(Protocol):
    def stream_tts_sync(self, text: str, options: Any = None) -> Iterator[tuple[int, np.ndarray]]: ...


class Brain(Protocol):
    def stream_reply(self, avatar: Avatar, history: list[dict]) -> "ReplyStream": ...


class ReplyStream(Protocol):
    def text_stream(self) -> Iterator[str]: ...

    def final_content(self) -> list[dict] | None:
        """Full assistant content blocks to keep in history, or None if unavailable."""
        ...

    def refused(self) -> bool: ...


def split_sentences(deltas: Iterable[str]) -> Iterator[str]:
    """Group streamed text into speakable chunks so TTS can start before the reply ends."""
    buffer = ""
    for delta in deltas:
        buffer += delta
        while True:
            match = None
            for candidate in _SENTENCE_END.finditer(buffer):
                if candidate.end() >= _MIN_SENTENCE_CHARS:
                    match = candidate
                    break
            if match is None:
                break
            sentence, buffer = buffer[: match.end()].strip(), buffer[match.end():]
            if sentence:
                yield sentence
    if buffer.strip():
        yield buffer.strip()


def build_system_prompt(avatar: Avatar) -> str:
    return f"{avatar.persona_prompt.strip()}\n\n{VOICE_RULES.format(name=avatar.name)}"


class ClaudeReplyStream:
    def __init__(self, manager):
        self._manager = manager
        self._final = None

    def text_stream(self) -> Iterator[str]:
        with self._manager as stream:
            yield from stream.text_stream
            self._final = stream.get_final_message()

    def final_content(self) -> list[dict] | None:
        if self._final is None:
            return None
        return [block.model_dump(exclude_none=True) for block in self._final.content]

    def refused(self) -> bool:
        return self._final is not None and self._final.stop_reason == "refusal"


class ClaudeBrain:
    def __init__(self, model: str | None = None, client=None):
        self.model = model or os.environ.get("AVATAR_CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL)
        self._client = client

    @property
    def client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic()
        return self._client

    def stream_reply(self, avatar: Avatar, history: list[dict]) -> ClaudeReplyStream:
        return ClaudeReplyStream(
            self.client.beta.messages.stream(
                model=self.model,
                max_tokens=2048,
                system=build_system_prompt(avatar),
                messages=history,
                # Low effort keeps time-to-first-word short for voice.
                output_config={"effort": os.environ.get("AVATAR_CLAUDE_EFFORT", "low")},
                # On a policy decline, retry server-side on Anthropic's recommended fallback model.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        )

    def draft_persona(self, name: str, notes: str) -> dict:
        """Write a starter persona prompt and greeting for the avatar studio."""
        import json

        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            output_config={
                "effort": "medium",
                "format": {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "persona_prompt": {"type": "string"},
                            "greeting": {"type": "string"},
                            "tagline": {"type": "string"},
                        },
                        "required": ["persona_prompt", "greeting", "tagline"],
                        "additionalProperties": False,
                    },
                },
            },
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Write a character brief for a voice avatar of {name}.\n"
                        f"Creator notes: {notes or '(none)'}\n\n"
                        "persona_prompt: second person (\"You are ...\"), 150-250 words covering who they are, "
                        "era and life facts to stay accurate to, worldview, speaking style and verbal habits, and "
                        "what they would not know about (events after their lifetime, for historical figures). "
                        "greeting: one or two sentences they say when a conversation starts. "
                        "tagline: under eight words."
                    ),
                }
            ],
        )
        if response.stop_reason == "refusal":
            raise ValueError("Claude declined to draft this persona")
        text = next(block.text for block in response.content if block.type == "text")
        return json.loads(text)


@dataclass
class Session:
    avatar_id: str
    history: list[dict] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


class SessionRegistry:
    """Maps a WebRTC connection id to the avatar and conversation history for that call."""

    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def register(self, webrtc_id: str, avatar_id: str) -> Session:
        with self._lock:
            session = self._sessions[webrtc_id] = Session(avatar_id=avatar_id)
            return session

    def get(self, webrtc_id: str) -> Session | None:
        with self._lock:
            return self._sessions.get(webrtc_id)

    def drop(self, webrtc_id: str) -> None:
        with self._lock:
            self._sessions.pop(webrtc_id, None)


def caption(role: str, text: str, turn: int, final: bool) -> AdditionalOutputs:
    return AdditionalOutputs({"role": role, "text": text, "turn": turn, "final": final})


class ConversationPipeline:
    def __init__(
        self,
        store: AvatarStore,
        sessions: SessionRegistry,
        brain: Brain | None = None,
        stt: SpeechToText | None = None,
        tts: TextToSpeech | None = None,
    ):
        self.store = store
        self.sessions = sessions
        self.brain = brain or ClaudeBrain()
        self._stt = stt
        self._tts = tts

    @property
    def stt(self) -> SpeechToText:
        if self._stt is None:
            from fastrtc import get_stt_model

            self._stt = get_stt_model()
        return self._stt

    @property
    def tts(self) -> TextToSpeech:
        if self._tts is None:
            from fastrtc import get_tts_model

            self._tts = get_tts_model()
        return self._tts

    def warm_up(self) -> None:
        """Load the speech models before the first call instead of during it."""
        _ = self.stt, self.tts

    def _current(self) -> tuple[Session, Avatar] | None:
        session = self.sessions.get(get_current_context().webrtc_id)
        if session is None:
            return None
        avatar = self.store.get(session.avatar_id)
        if avatar is None:
            return None
        return session, avatar

    def _speak(self, avatar: Avatar, text: str) -> Iterator[tuple[int, np.ndarray]]:
        options = KokoroTTSOptions(voice=avatar.voice, speed=avatar.voice_speed, lang="en-us")
        yield from self.tts.stream_tts_sync(text, options)

    def greet(self):
        """Startup hook: the avatar opens the conversation with its greeting."""
        current = self._current()
        if current is None:
            return
        session, avatar = current
        if not avatar.greeting:
            return
        with session.lock:
            # Recorded as the first assistant turn so the model knows it already said hello.
            session.history.append({"role": "user", "content": "(The user has joined the call.)"})
            session.history.append({"role": "assistant", "content": avatar.greeting})
        yield caption("assistant", avatar.greeting, turn=0, final=True)
        yield from self._speak(avatar, avatar.greeting)

    def respond(self, audio: tuple[int, np.ndarray]):
        current = self._current()
        if current is None:
            return
        session, avatar = current

        user_text = self.stt.stt(audio).strip()
        if not user_text:
            return

        with session.lock:
            session.history.append({"role": "user", "content": user_text})
            turn = len(session.history)
            history = list(session.history)
        yield caption("user", user_text, turn=turn, final=True)

        reply = self.brain.stream_reply(avatar, history)
        spoken: list[str] = []
        completed = False
        try:
            for sentence in split_sentences(reply.text_stream()):
                spoken.append(sentence)
                yield caption("assistant", " ".join(spoken), turn=turn + 1, final=False)
                yield from self._speak(avatar, sentence)
            completed = True

            if reply.refused() and not spoken:
                line = "I would rather not go there. Ask me about something else."
                spoken.append(line)
                yield from self._speak(avatar, line)
            yield caption("assistant", " ".join(spoken), turn=turn + 1, final=True)
        except Exception as exc:
            # FastRTC re-raises handler errors, which ends the turn silently; report it instead.
            logger.exception("Avatar reply failed")
            yield caption("system", f"The avatar could not answer: {exc}", turn=turn + 1, final=True)
        finally:
            # Runs on normal completion and when an interruption closes the generator.
            content = reply.final_content() if completed and not reply.refused() else None
            if content is None and spoken:
                text = " ".join(spoken) + ("" if completed else INTERRUPTED_MARKER)
                content = [{"type": "text", "text": text}]
            if content:
                with session.lock:
                    session.history.append({"role": "assistant", "content": content})
