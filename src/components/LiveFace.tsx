import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { CallPhase } from '../hooks/useConversation';

interface LiveFaceProps {
  src: string;
  name: string;
  phase: CallPhase;
  levelRef: MutableRefObject<number>;
}

/**
 * Portrait face engine: animates the cloned photo from the avatar's live voice level.
 * When a neural face engine (e.g. Ditto) renders on the server, this component is
 * where its video track replaces the still image.
 */
export function LiveFace({ src, name, phase, levelRef }: LiveFaceProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const level = Math.min(levelRef.current * 8, 1);
      const breathe = Math.sin((now - start) / 1600) * 0.006;
      if (imageRef.current) {
        imageRef.current.style.transform = `scale(${1.02 + breathe + level * 0.025}) translateY(${-level * 4}px) rotate(${Math.sin(now / 900) * level * 0.8}deg)`;
      }
      if (ringRef.current) {
        ringRef.current.style.boxShadow = `0 0 0 ${2 + level * 10}px rgba(31, 92, 135, ${0.15 + level * 0.45})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);

  return (
    <div
      ref={ringRef}
      className={`relative aspect-square w-full max-w-[420px] overflow-hidden rounded-full border border-[#7ea5c5]/70 bg-white transition-[filter] duration-500 ${
        phase === 'idle' ? 'grayscale-[35%]' : ''
      }`}
    >
      <img
        ref={imageRef}
        src={src}
        alt={`${name}, AI recreation`}
        className="h-full w-full object-cover will-change-transform"
        draggable={false}
      />
      {phase === 'thinking' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-2 w-2 animate-bounce rounded-full bg-white/90 shadow"
              style={{ animationDelay: `${dot * 120}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
