
import React from 'react';
import { Candidate } from '../types';

interface ResultsProps {
  candidates: Candidate[];
  revealedIds: string[];
}

const Results: React.FC<ResultsProps> = ({ candidates, revealedIds }) => {
  const visibleCandidates = candidates.filter(c => revealedIds.includes(c.id));

  if (visibleCandidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-8 pb-20">
      <h2 className="text-3xl font-black text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-500">
        FOUND MEMORIES
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {visibleCandidates.map((game, index) => (
          <div 
            key={game.id} 
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl animate-drop flex flex-col"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Header */}
            <div className="relative h-40 group">
              <img src={game.icon} alt={game.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mb-1">RANK #{index + 1}</div>
                <h3 className="text-white font-bold text-sm leading-tight line-clamp-2">{game.name}</h3>
              </div>
              <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-zinc-900/80 backdrop-blur-md border border-white/20 flex items-center justify-center">
                 <span className="text-white font-black text-sm">{game.totalScore}</span>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 flex-1 flex flex-col gap-4">
              {/* Score Breakdown */}
              <div>
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Score Analysis</h4>
                <ul className="space-y-2">
                  {game.breakdown.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <div className={`mt-0.5 min-w-[24px] h-5 rounded flex items-center justify-center font-bold ${item.scoreChange >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {item.scoreChange > 0 ? '+' : ''}{item.scoreChange}
                      </div>
                      <div className="flex-1">
                        <span className="font-semibold">{item.clueText}: </span>
                        <span className="text-zinc-500 dark:text-zinc-400">{item.reason}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Evidence */}
              <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Verified Evidence</h4>
                <div className="flex flex-col gap-2">
                  {game.evidence.slice(0, 3).map((ev, i) => (
                    <a 
                      key={i} 
                      href={ev.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex flex-col p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 truncate group-hover:text-indigo-500">{ev.title}</span>
                        <i className="fa-solid fa-arrow-up-right-from-square text-[8px] opacity-40"></i>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{ev.summary}</p>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Results;
