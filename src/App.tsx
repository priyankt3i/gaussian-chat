import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Power } from 'lucide-react';
import { SplatViewer } from './components/SplatViewer';
import { useWebRTC } from './hooks/useWebRTC';

export default function App() {
  const { isConnected, isConnecting, error, connect, disconnect } = useWebRTC('http://localhost:8000/rtc/offer');
  const [activeTab, setActiveTab] = useState('CONTINUE');

  // A placeholder splat file. The model stays in the center, just like Chloe.
  const SPLAT_URL = 'https://huggingface.co/datasets/mkkellogg/gaussian-splats-3d-demo-data/resolve/main/garden.ksplat';

  const menuItems = ['CONTINUE', 'NEW STORY', 'CHAPTERS', 'OPTIONS', 'EXTRAS'];

  const handleMenuClick = (item: string) => {
    setActiveTab(item);
    if (item === 'CONTINUE' && !isConnected && !isConnecting) {
      connect();
    }
  };

  const handlePower = () => {
    disconnect();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans select-none bg-[#eef2f6]">
      {/* Background blur/light overlay mimicking the bright bokeh environment */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-white/70 to-[#dbe4ec] pointer-events-none"></div>

      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0 mix-blend-darken opacity-90">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={1.5} />
          {/* We render the avatar instantly, matching the static presence of Chloe */}
          <SplatViewer url={SPLAT_URL} />
        </Canvas>
      </div>

      {/* Foreground UI Layer */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none pb-24 pt-12 px-12">
        
        {/* Top Right Header */}
        <div className="w-full flex justify-end">
          <button 
            onClick={handlePower}
            className="pointer-events-auto flex items-center gap-4 text-[#005b9f] hover:text-[#004070] transition-colors mt-8 mr-12"
          >
            <Power size={36} strokeWidth={1.5} />
            <span className="text-[15px] font-medium tracking-[0.1em]">
              RETURN TO DESKTOP
            </span>
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

        {/* Bottom Horizontal Menu */}
        <div className="w-full relative flex justify-center items-center gap-16 mb-8 pointer-events-none">
          {/* Connecting line */}
          <div className="absolute top-1/2 left-[15%] right-[15%] h-[1px] bg-slate-300/60 -z-20" />
          
          {menuItems.map((item) => {
            const isActive = activeTab === item;
            
            return (
              <div key={item} className="relative pointer-events-auto">
                {/* Node dots on the line */}
                {!isActive && (
                  <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-1 h-1 bg-slate-300" />
                )}

                {/* Active State Decorations */}
                {isActive && (
                  <>
                    {/* Brackets */}
                    <div className="absolute -left-6 -top-4 w-3 h-3 border-l-[1.5px] border-t-[1.5px] border-slate-700" />
                    <div className="absolute -right-6 -top-4 w-3 h-3 border-r-[1.5px] border-t-[1.5px] border-slate-700" />
                    <div className="absolute -left-6 -bottom-4 w-3 h-3 border-l-[1.5px] border-b-[1.5px] border-slate-700" />
                    <div className="absolute -right-6 -bottom-4 w-3 h-3 border-r-[1.5px] border-b-[1.5px] border-slate-700" />
                    
                    {/* Blue background polygon */}
                    <div className="absolute -inset-x-4 -inset-y-2 detroit-polygon -z-10 opacity-90 shadow-lg" />
                  </>
                )}
                
                <button 
                  onClick={() => handleMenuClick(item)}
                  className={`text-[14px] tracking-[0.2em] transition-colors duration-300 px-2 py-1 ${
                    isActive 
                      ? 'text-white font-medium' 
                      : 'text-slate-800 hover:text-[#005b9f]'
                  }`}
                >
                  {item}
                </button>
                
                {/* Status sub-text (like "NEW" under EXTRAS) */}
                {item === 'EXTRAS' && !isActive && (
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] font-bold text-slate-800 tracking-wider">
                    <span>▲</span> NEW
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
