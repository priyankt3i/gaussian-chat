import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare, UserRoundPlus } from 'lucide-react';
import { Studio } from './components/Studio';
import { AvatarCall, AvatarGallery } from './components/Talk';
import { api } from './lib/api';
import type { Avatar } from './lib/api';

type View = 'talk' | 'studio';

export default function App() {
  const [view, setView] = useState<View>('talk');
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selected, setSelected] = useState<Avatar | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAvatars(await api.listAvatars());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load avatars.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreated = (avatar: Avatar) => {
    refresh();
    setSelected(avatar);
    setView('talk');
  };

  const handleDelete = async (avatar: Avatar) => {
    if (!window.confirm(`Delete ${avatar.name}? This removes the avatar and its files.`)) return;
    try {
      await api.deleteAvatar(avatar.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the avatar.');
    }
  };

  const tabs: { value: View; label: string; icon: typeof MessagesSquare }[] = [
    { value: 'talk', label: 'Talk', icon: MessagesSquare },
    { value: 'studio', label: 'Avatar Studio', icon: UserRoundPlus },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#eef2f6] font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-white/70 to-[#dbe4ec]" />

      <div className="relative z-10 flex min-h-screen flex-col gap-8 px-4 py-6 md:px-12 md:py-10">
        <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <h1 className="text-lg font-semibold text-slate-900">Persona Portal</h1>
            <span className="font-mono text-[11px] uppercase text-slate-500">Real-time AI avatars</span>
          </div>
          <nav className="grid grid-cols-2 border border-[#7ea5c5]/70 bg-white/45 backdrop-blur-md">
            {tabs.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-current={view === value ? 'page' : undefined}
                className={`flex h-11 items-center justify-center gap-2 px-4 text-sm font-medium transition-colors ${
                  view === value ? 'bg-[#1f5c87] text-white' : 'text-[#005b9f] hover:bg-white/70'
                }`}
              >
                <Icon size={17} strokeWidth={1.8} /> {label}
              </button>
            ))}
          </nav>
        </header>

        {error && (
          <p className="mx-auto w-full max-w-5xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        <main className="flex-1">
          {view === 'studio' ? (
            <Studio onCreated={handleCreated} />
          ) : selected ? (
            <AvatarCall key={selected.id} avatar={selected} onBack={() => setSelected(null)} />
          ) : (
            <AvatarGallery avatars={avatars} onSelect={setSelected} onDelete={handleDelete} />
          )}
        </main>
      </div>
    </div>
  );
}
