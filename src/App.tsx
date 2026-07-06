import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { Mic, Settings, SlidersHorizontal, Volume2, X } from 'lucide-react';
import { SplatViewer } from './components/SplatViewer';
import { useWebRTC } from './hooks/useWebRTC';

type RenderQuality = 'performance' | 'balanced' | 'cinematic';
type SplatFormat = 'ksplat' | 'splat' | 'ply' | 'spz';

interface PortalSettings {
  s2sProvider: string;
  modelEndpoint: string;
  voice: string;
  splatUrl: string;
  splatFormat: SplatFormat | '';
  splatLabel: string;
  renderQuality: RenderQuality;
}

const renderQualityDpr: Record<RenderQuality, [number, number]> = {
  performance: [1, 1],
  balanced: [1, 1.5],
  cinematic: [1.5, 2],
};

const supportedAssetExtensions: SplatFormat[] = ['ksplat', 'splat', 'ply', 'spz'];

function getAssetFormat(source: string): SplatFormat | '' {
  const withoutQuery = source.split('?')[0].split('#')[0].toLowerCase();
  const extension = withoutQuery.split('.').pop();

  return supportedAssetExtensions.includes(extension as SplatFormat)
    ? extension as SplatFormat
    : '';
}

function getAssetFilename(source: string, format: SplatFormat | '') {
  const fallbackName = format ? `avatar.${format}` : 'avatar.ksplat';

  try {
    const parsedUrl = new URL(source);
    const filename = parsedUrl.pathname.split('/').filter(Boolean).pop();
    return filename && filename.includes('.') ? filename : fallbackName;
  } catch {
    const filename = source.split('/').filter(Boolean).pop();
    return filename && filename.includes('.') ? filename : fallbackName;
  }
}

function normalizeRemoteAssetUrl(source: string) {
  if (source.includes('huggingface.co') && source.includes('/blob/')) {
    return source.replace('/blob/', '/resolve/');
  }

  return source;
}

function getBackendOrigin(endpoint: string) {
  try {
    return new URL(endpoint).origin;
  } catch {
    return 'http://localhost:8000';
  }
}

function resolveViewerAsset(settings: PortalSettings) {
  if (!settings.splatUrl) {
    return { url: '', format: '' as const, label: 'Local placeholder avatar' };
  }

  const format = settings.splatFormat || getAssetFormat(settings.splatUrl);
  if (!format) {
    return { url: '', format: '' as const, label: 'Unsupported asset type' };
  }

  if (settings.splatUrl.startsWith('blob:')) {
    return { url: settings.splatUrl, format, label: settings.splatLabel || `Local ${format.toUpperCase()} file` };
  }

  const normalizedUrl = normalizeRemoteAssetUrl(settings.splatUrl);
  const filename = getAssetFilename(normalizedUrl, format);
  const proxyUrl = `${getBackendOrigin(settings.modelEndpoint)}/asset-proxy/${encodeURIComponent(filename)}?url=${encodeURIComponent(normalizedUrl)}`;

  return { url: proxyUrl, format, label: `Remote ${format.toUpperCase()} via backend proxy` };
}

export default function App() {
  const defaultBackendOfferUrl = import.meta.env.VITE_BACKEND_OFFER_URL ?? 'http://localhost:8000/webrtc/offer';
  const defaultSplatUrl = import.meta.env.VITE_SPLAT_URL ?? '';
  const objectUrlRef = useRef<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PortalSettings>({
    s2sProvider: 'Mock S2S Echo',
    modelEndpoint: defaultBackendOfferUrl,
    voice: 'Neutral Assistant',
    splatUrl: defaultSplatUrl,
    splatFormat: getAssetFormat(defaultSplatUrl),
    splatLabel: defaultSplatUrl ? getAssetFilename(defaultSplatUrl, getAssetFormat(defaultSplatUrl)) : '',
    renderQuality: 'balanced',
  });
  const { isConnected, isConnecting, error, connect, disconnect } = useWebRTC(settings.modelEndpoint);
  const viewerAsset = resolveViewerAsset(settings);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const updateSetting = <Key extends keyof PortalSettings>(key: Key, value: PortalSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleAssetUrlChange = (source: string) => {
    updateSetting('splatUrl', source);
    updateSetting('splatFormat', getAssetFormat(source));
    updateSetting('splatLabel', source ? getAssetFilename(source, getAssetFormat(source)) : '');
  };

  const handleAssetFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const format = getAssetFormat(file.name);
    if (!format) {
      updateSetting('splatUrl', '');
      updateSetting('splatFormat', '');
      updateSetting('splatLabel', 'Unsupported local file type');
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    updateSetting('splatUrl', objectUrl);
    updateSetting('splatFormat', format);
    updateSetting('splatLabel', file.name);
  };

  const handleConversationToggle = () => {
    if (isConnected) {
      disconnect();
    } else if (!isConnecting) {
      connect();
    }
  };

  const statusText = isConnected ? 'Live session' : isConnecting ? 'Connecting' : 'Standby';

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans select-none bg-[#eef2f6]">
      {/* Background blur/light overlay mimicking the bright bokeh environment */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-white/70 to-[#dbe4ec] pointer-events-none"></div>

      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0 mix-blend-darken opacity-90">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={renderQualityDpr[settings.renderQuality]}>
          <ambientLight intensity={1.5} />
          <SplatViewer url={viewerAsset.url} format={viewerAsset.format} quality={settings.renderQuality} />
        </Canvas>
      </div>

      {/* Foreground UI Layer */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none px-6 py-8 md:px-12 md:py-12">
        
        <div className="w-full flex items-start justify-between">
          <div className="text-[11px] uppercase text-slate-500 font-mono">
            {statusText}
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="pointer-events-auto flex h-11 items-center gap-3 border border-[#7ea5c5]/70 bg-white/45 px-4 text-sm font-medium text-[#005b9f] shadow-sm backdrop-blur-md transition-colors hover:bg-white/70"
            aria-label="Open settings"
          >
            <Settings size={19} strokeWidth={1.8} />
            <span>Settings</span>
          </button>
        </div>

        {/* Error Overlay */}
        {error && (
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-red-100 text-red-600 px-6 py-2 rounded shadow-sm text-sm tracking-wide">
            SYS_ERR: {error}
          </div>
        )}

        {/* Micro annotations (decorative) */}
        <div className="absolute left-[15%] bottom-[30%] text-[8px] text-slate-400 tracking-widest font-mono">GM / 7.4</div>
        <div className="absolute left-[24%] bottom-[28%] text-[8px] text-slate-400 tracking-widest font-mono">DB / 4.3</div>
        <div className="absolute right-[15%] top-[25%] text-[8px] text-slate-400 tracking-widest font-mono">GM / 8.7</div>
        <div className="absolute right-[15%] top-[32%] text-[8px] text-slate-400 tracking-widest font-mono">92.3</div>
        
        <div className="absolute left-[35%] bottom-[28%] text-[7px] text-slate-400 tracking-widest font-mono">TRHS</div>
        <div className="absolute right-[35%] bottom-[28%] text-[7px] text-slate-400 tracking-widest font-mono">TRHS / 6.2</div>

        <div className="w-full relative flex justify-center pb-4 pointer-events-none">
          <div className="absolute top-1/2 left-[12%] right-[12%] h-px bg-slate-300/70 -z-20" />

          <div className="relative pointer-events-auto">
            <div className="absolute -left-6 -top-4 h-3 w-3 border-l border-t border-slate-700" />
            <div className="absolute -right-6 -top-4 h-3 w-3 border-r border-t border-slate-700" />
            <div className="absolute -left-6 -bottom-4 h-3 w-3 border-l border-b border-slate-700" />
            <div className="absolute -right-6 -bottom-4 h-3 w-3 border-r border-b border-slate-700" />
            <button
              type="button"
              onClick={handleConversationToggle}
              className="flex h-12 min-w-60 items-center justify-center gap-3 bg-[#1f5c87]/90 px-8 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#16486b] disabled:cursor-wait disabled:opacity-70"
              disabled={isConnecting}
            >
              <Mic size={18} strokeWidth={1.8} />
              <span>{isConnected ? 'End Conversation' : isConnecting ? 'Connecting' : 'Start Conversation'}</span>
            </button>
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-sm">
          <div
            className="pointer-events-auto w-full max-w-2xl border border-[#8fb5d1]/80 bg-[#f8fbfd]/95 p-6 text-slate-900 shadow-2xl md:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="flex items-center justify-between border-b border-slate-300/80 pb-4">
              <div className="flex items-center gap-3">
                <SlidersHorizontal size={21} className="text-[#005b9f]" />
                <h2 id="settings-title" className="text-lg font-semibold">
                  Settings
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="flex h-9 w-9 items-center justify-center text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-950"
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                <span>S2S Provider</span>
                <select
                  value={settings.s2sProvider}
                  onChange={(event) => updateSetting('s2sProvider', event.target.value)}
                  className="h-11 border border-slate-300 bg-white/80 px-3 text-sm outline-none transition-colors focus:border-[#005b9f]"
                >
                  <option>Mock S2S Echo</option>
                  <option>LLaMA-Omni</option>
                  <option>Custom Endpoint</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium">
                <span>Voice</span>
                <select
                  value={settings.voice}
                  onChange={(event) => updateSetting('voice', event.target.value)}
                  className="h-11 border border-slate-300 bg-white/80 px-3 text-sm outline-none transition-colors focus:border-[#005b9f]"
                >
                  <option>Neutral Assistant</option>
                  <option>Warm Female</option>
                  <option>Calm Male</option>
                  <option>Studio Clone</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium md:col-span-2">
                <span>Model Endpoint</span>
                <input
                  value={settings.modelEndpoint}
                  onChange={(event) => updateSetting('modelEndpoint', event.target.value)}
                  className="h-11 border border-slate-300 bg-white/80 px-3 text-sm outline-none transition-colors focus:border-[#005b9f]"
                  placeholder="http://localhost:8000/webrtc/offer"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium md:col-span-2">
                <span>Avatar Asset URL</span>
                <input
                  value={settings.splatUrl.startsWith('blob:') ? '' : settings.splatUrl}
                  onChange={(event) => handleAssetUrlChange(event.target.value)}
                  className="h-11 border border-slate-300 bg-white/80 px-3 text-sm outline-none transition-colors focus:border-[#005b9f]"
                  placeholder="https://huggingface.co/.../resolve/main/avatar.ksplat"
                />
                <span className="text-xs font-normal text-slate-500">
                  Hugging Face /blob/ URLs are converted to /resolve/ and proxied through the backend.
                </span>
              </label>

              <label className="grid gap-2 text-sm font-medium">
                <span>Local .ksplat/.splat/.ply/.spz</span>
                <input
                  type="file"
                  accept=".ksplat,.splat,.ply,.spz"
                  onChange={handleAssetFile}
                  className="block h-11 border border-slate-300 bg-white/80 text-sm file:mr-4 file:h-full file:border-0 file:bg-[#e3eef7] file:px-4 file:text-sm file:font-medium file:text-[#005b9f]"
                />
                <span className="text-xs font-normal text-slate-500">
                  {settings.splatLabel || viewerAsset.label}
                </span>
              </label>

              <fieldset className="grid gap-2 text-sm font-medium">
                <legend className="mb-2">Render Quality</legend>
                <div className="grid grid-cols-3 border border-slate-300 bg-white/70">
                  {(['performance', 'balanced', 'cinematic'] as RenderQuality[]).map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      onClick={() => updateSetting('renderQuality', quality)}
                      className={`h-10 text-xs font-semibold capitalize transition-colors ${
                        settings.renderQuality === quality
                          ? 'bg-[#1f5c87] text-white'
                          : 'text-slate-700 hover:bg-[#e3eef7]'
                      }`}
                    >
                      {quality}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-7 flex items-center justify-between border-t border-slate-300/80 pt-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Volume2 size={16} className="text-[#005b9f]" />
                <span>{settings.s2sProvider} · {settings.voice}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="h-10 bg-[#1f5c87] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#16486b]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
