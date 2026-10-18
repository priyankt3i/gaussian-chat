import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL, api } from '../lib/api';

export type TalkMode = 'vad' | 'ptt';
export type CallPhase = 'idle' | 'connecting' | 'listening' | 'user-speaking' | 'thinking' | 'speaking';

export interface Caption {
  role: 'user' | 'assistant' | 'system';
  text: string;
  turn: number;
  final: boolean;
}

// Remote audio level above which the avatar counts as speaking, and how long it must
// stay quiet before we flip back to listening (TTS has short gaps between sentences).
const SPEAKING_LEVEL = 0.02;
const SPEAKING_HOLD_MS = 450;

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === 'complete') {
        peerConnection.removeEventListener('icegatheringstatechange', handleStateChange);
        resolve();
      }
    };

    peerConnection.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

export function useConversation() {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [mode, setModeState] = useState<TalkMode>('vad');
  const [isTalking, setIsTalking] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const webrtcIdRef = useRef<string | null>(null);
  const levelRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const modeRef = useRef<TalkMode>('vad');
  const phaseRef = useRef<CallPhase>('idle');

  const updatePhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const setMicEnabled = (enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  };

  const disconnect = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    levelRef.current = 0;
    if (webrtcIdRef.current) {
      api.endSession(webrtcIdRef.current).catch(() => undefined);
      webrtcIdRef.current = null;
    }
    setIsTalking(false);
    updatePhase('idle');
  }, [updatePhase]);

  // Tracks the avatar's voice level so the face can animate and the phase can show "speaking".
  const watchRemoteLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const samples = new Float32Array(analyser.fftSize);
    let lastLoud = 0;

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      levelRef.current = levelRef.current * 0.6 + rms * 0.4;

      const now = performance.now();
      if (rms > SPEAKING_LEVEL) {
        lastLoud = now;
        if (phaseRef.current !== 'speaking' && phaseRef.current !== 'user-speaking') updatePhase('speaking');
      } else if (phaseRef.current === 'speaking' && now - lastLoud > SPEAKING_HOLD_MS) {
        updatePhase('listening');
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [updatePhase]);

  const connect = useCallback(
    async (avatarId: string) => {
      disconnect();
      setError(null);
      setCaptions([]);
      updatePhase('connecting');

      try {
        const webrtcId = crypto.randomUUID();
        webrtcIdRef.current = webrtcId;
        await api.createSession(webrtcId, avatarId);

        // Echo cancellation keeps the avatar's own voice from triggering barge-in in always-listening mode.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current = stream;
        setMicEnabled(modeRef.current === 'vad');

        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peerConnectionRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // FastRTC reports VAD events (started_talking, pause_detected, ...) on this channel.
        const channel = pc.createDataChannel('text');
        channel.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'log' && message.data === 'started_talking') updatePhase('user-speaking');
            if (message.type === 'log' && message.data === 'pause_detected') updatePhase('thinking');
            if (message.type === 'error') setError(String(message.data));
          } catch {
            // Ignore non-JSON messages.
          }
        };

        pc.ontrack = (event) => {
          const remoteStream = event.streams[0];
          const audioElement = new Audio();
          audioElement.autoplay = true;
          audioElement.srcObject = remoteStream;
          audioElement.play().catch((err) => console.error('Error playing avatar audio:', err));
          audioElementRef.current = audioElement;

          const audioContext = new AudioContext();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          audioContext.createMediaStreamSource(remoteStream).connect(analyser);
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          watchRemoteLevel();
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') {
            setError('Connection to the avatar server failed.');
            disconnect();
          }
        };

        const captionsSource = new EventSource(`${BACKEND_URL}/sessions/${webrtcId}/captions`);
        captionsSource.onmessage = (event) => {
          const next = JSON.parse(event.data) as Caption;
          if (next.role === 'system') updatePhase('listening');
          setCaptions((current) => {
            const index = current.findIndex((item) => item.turn === next.turn && item.role === next.role);
            if (index === -1) return [...current, next];
            const copy = [...current];
            copy[index] = next;
            return copy;
          });
        };
        eventSourceRef.current = captionsSource;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGatheringComplete(pc);

        const response = await fetch(`${BACKEND_URL}/webrtc/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: pc.localDescription?.sdp, type: pc.localDescription?.type, webrtc_id: webrtcId }),
        });
        if (!response.ok) throw new Error('The avatar server rejected the call.');
        const answer = await response.json();
        if (answer.status === 'failed') throw new Error(answer.meta?.error ?? 'The avatar server rejected the call.');
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        updatePhase('listening');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start the call.';
        disconnect();
        setError(
          message.includes('Permission') || message.includes('NotAllowed')
            ? 'Microphone access is needed to talk to the avatar.'
            : message,
        );
      }
    },
    [disconnect, updatePhase, watchRemoteLevel],
  );

  const setMode = useCallback((next: TalkMode) => {
    modeRef.current = next;
    setModeState(next);
    setIsTalking(false);
    setMicEnabled(next === 'vad');
    if (audioElementRef.current) audioElementRef.current.muted = false;
  }, []);

  // Push-to-talk: the mic only carries audio while held. Releasing sends silence, which the
  // server's VAD treats as the end of the turn. Holding also mutes the avatar so you can cut in.
  const setTalking = useCallback((talking: boolean) => {
    if (modeRef.current !== 'ptt' || !peerConnectionRef.current) return;
    setIsTalking(talking);
    setMicEnabled(talking);
    if (talking) updatePhase('user-speaking');
    if (audioElementRef.current) audioElementRef.current.muted = talking;
  }, [updatePhase]);

  useEffect(() => disconnect, [disconnect]);

  return {
    phase,
    error,
    captions,
    mode,
    isTalking,
    isLive: phase !== 'idle' && phase !== 'connecting',
    levelRef,
    connect,
    disconnect,
    setMode,
    setTalking,
  };
}
