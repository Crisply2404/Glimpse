
import React, { useEffect, useState } from 'react';

interface GachaMachineProps {
  isRolling: boolean;
  onReveal: () => void;
  revealedCount: number;
  totalToReveal: number;
}

const GachaMachine: React.FC<GachaMachineProps> = ({ isRolling, onReveal, revealedCount, totalToReveal }) => {
  const [isJumping, setIsJumping] = useState(false);

  useEffect(() => {
    if (isRolling && revealedCount < totalToReveal) {
      const timer = setInterval(() => {
        setIsJumping(true);
        setTimeout(() => {
          setIsJumping(false);
          onReveal();
        }, 500);
      }, 1500);
      return () => clearInterval(timer);
    }
  }, [isRolling, revealedCount, totalToReveal, onReveal]);

  if (!isRolling && revealedCount === 0) return null;

  return (
    <div className="flex flex-col items-center mb-12 py-10">
      <div className={`relative w-48 h-64 bg-zinc-100 dark:bg-zinc-800 border-4 border-zinc-200 dark:border-zinc-700 rounded-3xl flex flex-col items-center justify-between p-4 shadow-xl overflow-hidden ${isJumping ? 'animate-shake' : ''}`}>
        {/* Machine Head */}
        <div className="w-full h-32 bg-indigo-500 rounded-2xl relative flex items-center justify-center p-2 border-b-4 border-indigo-700 shadow-inner">
          <div className="grid grid-cols-4 gap-1 w-full opacity-30">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-4 h-4 rounded-full bg-white"></div>
            ))}
          </div>
          <i className="fa-solid fa-gamepad absolute text-4xl text-white/50 animate-pulse"></i>
        </div>

        {/* The Crank */}
        <div className={`w-16 h-16 bg-zinc-200 dark:bg-zinc-700 rounded-full border-4 border-zinc-300 dark:border-zinc-600 flex items-center justify-center transform transition-transform duration-500 ${isJumping ? 'rotate-180' : ''}`}>
           <div className="w-10 h-2 bg-zinc-400 dark:bg-zinc-500 rounded-full"></div>
        </div>

        {/* Output Slot */}
        <div className="w-24 h-8 bg-zinc-900 rounded-t-lg border-x-4 border-t-4 border-zinc-700 mt-2 flex items-center justify-center">
          <div className={`w-6 h-6 rounded-full transition-all duration-500 ${isJumping ? 'bg-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.8)]' : 'bg-transparent'}`}></div>
        </div>

        {/* Labels */}
        <div className="absolute top-2 left-2 right-2 flex justify-between">
           <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
        </div>
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Gacha Reveal Engine</p>
        <p className="text-sm text-zinc-400">{revealedCount} / {totalToReveal} Games Dropped</p>
      </div>
    </div>
  );
};

export default GachaMachine;
