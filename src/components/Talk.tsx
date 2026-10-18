import { useEffect, useRef } from 'react';
import { ArrowLeft, Mic, PhoneOff, Radio, Trash2 } from 'lucide-react';
import { LiveFace } from './LiveFace';
import { useConversation } from '../hooks/useConversation';
import type { CallPhase, TalkMode } from '../hooks/useConversation';
import { portraitSrc } from '../lib/api';
import type { Avatar } from '../lib/api';

interface GalleryProps {
  avatars: Avatar[];
  onSelect: (avatar: Avatar) => void;
  onDelete: (avatar: Avatar) => void;
}

export function AvatarGallery({ avatars, onSelect, onDelete }: GalleryProps) {
  if (avatars.length === 0) {
    return <p className="text-center text-sm text-slate-500">No avatars yet. Create one in the Studio.</p>;
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {avatars.map((avatar) => (
        <div key={avatar.id} className="group relative border border-[#7ea5c5]/60 bg-white/60 transition-colors hover:bg-white/90">
          <button type="button" onClick={() => onSelect(avatar)} className="block w-full text-left">
            <img src={portraitSrc(avatar)} alt="" className="aspect-square w-full object-cover" draggable={false} />
            <div className="grid gap-0.5 p-3">
              <span className="text-sm font-semibold text-slate-900">{avatar.name}</span>
              <span className="truncate text-xs text-slate-500">{avatar.tagline || 'AI recreation'}</span>
            </div>
          </button>
          {!avatar.seed && (
            <button
              type="button"
              onClick={() => onDelete(avatar)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center bg-white/80 text-slate-600 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
              aria-label={`Delete ${avatar.name}`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

const phaseLabels: Record<CallPhase, string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  listening: 'Listening',
  'user-speaking': 'Hearing you',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

interface CallProps {
  avatar: Avatar;
  onBack: () => void;
}

export function AvatarCall({ avatar, onBack }: CallProps) {
  const { phase, error, captions, mode, isTalking, isLive, levelRef, connect, disconnect, setMode, setTalking } =
    useConversation();
  const captionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions]);

  // Hold Space to talk in push-to-talk mode.
  useEffect(() => {
    if (mode !== 'ptt' || !isLive) return;
    const isTyping = (event: KeyboardEvent) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat && !isTyping(event)) {
        event.preventDefault();
        setTalking(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTyping(event)) setTalking(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [mode, isLive, setTalking]);

  const modes: { value: TalkMode; label: string; icon: typeof Mic }[] = [
    { value: 'vad', label: 'Always listening', icon: Radio },
    { value: 'ptt', label: 'Push to talk', icon: Mic },
  ];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 md:grid-cols-[1fr_360px]">
      <div className="grid content-start justify-items-center gap-6">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => {
              disconnect();
              onBack();
            }}
            className="flex h-9 items-center gap-2 text-sm font-medium text-[#005b9f] hover:text-[#16486b]"
          >
            <ArrowLeft size={16} /> All avatars
          </button>
          <span className="font-mono text-[11px] uppercase text-slate-500">{phaseLabels[phase]}</span>
        </div>

        <LiveFace src={portraitSrc(avatar)} name={avatar.name} phase={phase} levelRef={levelRef} />

        <div className="grid justify-items-center gap-1 text-center">
          <h2 className="text-xl font-semibold text-slate-900">{avatar.name}</h2>
          <span className="border border-slate-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            AI recreation
          </span>
        </div>

        <div className="grid grid-cols-2 border border-slate-300 bg-white/70" role="radiogroup" aria-label="Talk mode">
          {modes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`flex h-10 items-center justify-center gap-2 px-4 text-xs font-semibold transition-colors ${
                mode === value ? 'bg-[#1f5c87] text-white' : 'text-slate-700 hover:bg-[#e3eef7]'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {!isLive ? (
          <button
            type="button"
            onClick={() => connect(avatar.id)}
            disabled={phase === 'connecting'}
            className="flex h-12 min-w-60 items-center justify-center gap-3 bg-[#1f5c87]/90 px-8 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#16486b] disabled:cursor-wait disabled:opacity-70"
          >
            <Mic size={18} strokeWidth={1.8} />
            {phase === 'connecting' ? 'Connecting' : `Talk to ${avatar.name.split(' ')[0]}`}
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {mode === 'ptt' && (
              <button
                type="button"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setTalking(true);
                }}
                onPointerUp={() => setTalking(false)}
                onPointerCancel={() => setTalking(false)}
                onContextMenu={(event) => event.preventDefault()}
                className={`flex h-14 min-w-56 touch-none select-none items-center justify-center gap-3 px-8 text-sm font-semibold text-white shadow-lg transition-colors ${
                  isTalking ? 'bg-[#0f3a59]' : 'bg-[#1f5c87]/90 hover:bg-[#16486b]'
                }`}
              >
                <Mic size={18} />
                {isTalking ? 'Release to send' : 'Hold to talk (Space)'}
              </button>
            )}
            <button
              type="button"
              onClick={disconnect}
              className="flex h-12 items-center justify-center gap-2 border border-red-300 bg-white/70 px-5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
            >
              <PhoneOff size={16} /> End call
            </button>
          </div>
        )}

        {mode === 'vad' && isLive && (
          <p className="text-center text-xs text-slate-500">Just talk. You can interrupt at any time. Headphones help avoid echo.</p>
        )}
        {error && <p className="border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      </div>

      <aside className="flex max-h-[70vh] min-h-64 flex-col border border-[#7ea5c5]/60 bg-white/60">
        <div className="border-b border-slate-300/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-relaxed">
          {captions.length === 0 && <p className="text-slate-400">The conversation will appear here.</p>}
          {captions.map((item) =>
            item.role === 'system' ? (
              <p key={`${item.role}-${item.turn}`} className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {item.text}
              </p>
            ) : (
            <div key={`${item.role}-${item.turn}`} className={item.role === 'user' ? 'text-right' : ''}>
              <span
                className={`inline-block max-w-[90%] px-3 py-2 text-left ${
                  item.role === 'user' ? 'bg-[#1f5c87] text-white' : 'border border-slate-200 bg-white text-slate-800'
                } ${item.final ? '' : 'opacity-80'}`}
              >
                {item.text}
              </span>
            </div>
            ),
          )}
          <div ref={captionsEndRef} />
        </div>
      </aside>
    </div>
  );
}
