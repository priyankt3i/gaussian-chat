import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ImagePlus, Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import type { Avatar, ConsentBasis, Voice } from '../lib/api';

interface StudioProps {
  onCreated: (avatar: Avatar) => void;
}

const consentOptions: { value: ConsentBasis; label: string; hint: string }[] = [
  { value: 'historical_figure', label: 'Historical figure', hint: 'A public figure who has died. Check estate and likeness rights before commercial use.' },
  { value: 'myself', label: 'Myself', hint: 'The photo and voice are of me.' },
  { value: 'documented_consent', label: 'Someone who agreed', hint: 'I have this person’s written permission to clone them.' },
  { value: 'ai_generated', label: 'Fictional (AI-generated)', hint: 'The photo is AI-generated and does not depict a real person.' },
];

const inputClass =
  'w-full border border-slate-300 bg-white/80 px-3 text-sm outline-none transition-colors focus:border-[#005b9f]';

export function Studio({ onCreated }: StudioProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tagline, setTagline] = useState('');
  const [personaPrompt, setPersonaPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  const [voice, setVoice] = useState('am_michael');
  const [consent, setConsent] = useState<ConsentBasis | ''>('');
  const [portrait, setPortrait] = useState<File | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [voiceSample, setVoiceSample] = useState<File | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listVoices().then(setVoices).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!portrait) {
      setPortraitPreview(null);
      return;
    }
    const url = URL.createObjectURL(portrait);
    setPortraitPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [portrait]);

  const handlePortrait = (event: ChangeEvent<HTMLInputElement>) => {
    setPortrait(event.target.files?.[0] ?? null);
  };

  const handleDraft = async () => {
    if (!name.trim()) {
      setError('Enter a name first so Claude knows who to write.');
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const draft = await api.draftPersona(name.trim(), notes.trim());
      setPersonaPrompt(draft.persona_prompt);
      setGreeting(draft.greeting);
      setTagline(draft.tagline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft a persona.');
    } finally {
      setDrafting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!portrait) return setError('Add a portrait photo.');
    if (!consent) return setError('Choose who this avatar is so we can record consent.');

    const form = new FormData();
    form.append('name', name);
    form.append('tagline', tagline);
    form.append('persona_prompt', personaPrompt);
    form.append('greeting', greeting);
    form.append('voice', voice);
    form.append('consent_basis', consent);
    form.append('portrait', portrait);
    if (voiceSample) form.append('voice_sample', voiceSample);

    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createAvatar(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the avatar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto grid w-full max-w-5xl gap-8 md:grid-cols-[320px_1fr]">
      <div className="grid content-start gap-4">
        <label className="group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#7ea5c5] bg-white/60 transition-colors hover:bg-white/80">
          {portraitPreview ? (
            <img src={portraitPreview} alt="Portrait preview" className="h-full w-full object-cover" />
          ) : (
            <div className="grid justify-items-center gap-2 px-6 text-center text-sm text-slate-600">
              <ImagePlus size={28} className="text-[#005b9f]" />
              <span className="font-medium">Upload a portrait</span>
              <span className="text-xs text-slate-500">A clear, front-facing photo works best. JPEG, PNG, or WebP up to 8 MB.</span>
            </div>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePortrait} className="sr-only" />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          <span>Voice</span>
          <select value={voice} onChange={(event) => setVoice(event.target.value)} className={`${inputClass} h-11`}>
            {voices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          <span>Voice sample (optional)</span>
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => setVoiceSample(event.target.files?.[0] ?? null)}
            className="block h-11 border border-slate-300 bg-white/80 text-sm file:mr-4 file:h-full file:border-0 file:bg-[#e3eef7] file:px-4 file:text-sm file:font-medium file:text-[#005b9f]"
          />
          <span className="text-xs font-normal text-slate-500">
            Stored with the avatar for a voice-cloning engine. The current voice engine uses the preset above.
          </span>
        </label>
      </div>

      <div className="grid content-start gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} h-11`} placeholder="Albert Einstein" required />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            <span>Tagline</span>
            <input value={tagline} onChange={(event) => setTagline(event.target.value)} className={`${inputClass} h-11`} placeholder="Physicist and violinist" />
          </label>
        </div>

        <div className="grid gap-2 text-sm font-medium">
          <span>Notes for Claude</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${inputClass} h-11 flex-1`}
              placeholder="Era, personality, what to focus on…"
            />
            <button
              type="button"
              onClick={handleDraft}
              disabled={drafting}
              className="flex h-11 items-center justify-center gap-2 border border-[#7ea5c5]/70 bg-white/60 px-4 text-sm font-medium text-[#005b9f] transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70"
            >
              {drafting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Draft personality
            </button>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          <span>Persona prompt</span>
          <textarea
            value={personaPrompt}
            onChange={(event) => setPersonaPrompt(event.target.value)}
            className={`${inputClass} min-h-48 py-2 leading-relaxed`}
            placeholder="You are … Describe who they are, what they know, how they talk."
            required
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          <span>Greeting</span>
          <input value={greeting} onChange={(event) => setGreeting(event.target.value)} className={`${inputClass} h-11`} placeholder="What they say when the call starts" />
        </label>

        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-2 font-medium">Who is this?</legend>
          {consentOptions.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3 border border-slate-300 bg-white/60 p-3 has-[:checked]:border-[#005b9f] has-[:checked]:bg-[#e3eef7]/70">
              <input
                type="radio"
                name="consent"
                value={option.value}
                checked={consent === option.value}
                onChange={() => setConsent(option.value)}
                className="mt-1 accent-[#1f5c87]"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-slate-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p className="border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex h-12 min-w-48 items-center justify-center gap-2 bg-[#1f5c87]/90 px-8 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#16486b] disabled:cursor-wait disabled:opacity-70"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Create avatar
          </button>
        </div>
      </div>
    </form>
  );
}
