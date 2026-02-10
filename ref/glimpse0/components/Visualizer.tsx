
import React from 'react';
import { SearchEvent, Candidate, Phase } from '../types';

interface VisualizerProps {
  events: SearchEvent[];
  candidates: Candidate[];
  currentPhase: Phase;
}

const Visualizer: React.FC<VisualizerProps> = ({ events, candidates, currentPhase }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Event Timeline */}
      <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
        <h3 className="text-sm font-bold uppercase text-zinc-400 mb-2 sticky top-0 bg-white dark:bg-zinc-950 py-1">Reasoning Stream</h3>
        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400 opacity-50 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <i className="fa-solid fa-stream text-4xl mb-4"></i>
            <p>Wait for search to begin...</p>
          </div>
        )}
        {[...events].reverse().map((event, idx) => (
          <div 
            key={event.id}
            className={`p-4 rounded-xl border-l-4 transition-all-300 transform animate-drop ${
              idx === 0 
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 scale-100 shadow-md' 
                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 scale-95 opacity-60'
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-bold uppercase text-indigo-500">{event.phase}</span>
              <span className="text-[10px] text-zinc-400">Step {events.length - idx}</span>
            </div>
            <h4 className="font-bold text-sm mb-1">{event.title}</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{event.description}</p>
          </div>
        ))}
      </div>

      {/* Candidate Pool */}
      <div className="lg:col-span-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase text-zinc-400">Global Candidate Pool</h3>
          <div className="flex gap-2">
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <div className="w-2 h-2 rounded-full bg-green-500"></div> Active
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <div className="w-2 h-2 rounded-full bg-zinc-300"></div> Eliminated
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {candidates.map((candidate) => {
            const isActive = !candidate.isEliminated || currentPhase === Phase.SEARCHING;
            return (
              <div key={candidate.id} className="flex flex-col items-center group">
                <div className="relative">
                  <img 
                    src={candidate.icon} 
                    alt={candidate.name}
                    className={`w-14 h-14 rounded-full border-2 object-cover transition-all duration-700 ${
                      isActive 
                        ? 'border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20 grayscale-0' 
                        : 'border-zinc-300 dark:border-zinc-700 scale-90 grayscale opacity-40 translate-y-2'
                    }`}
                  />
                  {isActive && (
                    <div className="absolute -top-1 -right-1 bg-green-500 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse"></div>
                  )}
                </div>
                <span className={`mt-2 text-[10px] text-center font-medium line-clamp-1 transition-opacity duration-700 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                  {candidate.name}
                </span>
              </div>
            );
          })}
        </div>

        {currentPhase === Phase.GACHA && (
          <div className="mt-12 flex flex-col items-center justify-center animate-bounce">
            <div className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
              <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
              REASONING COMPLETE - REVEALING...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Visualizer;
