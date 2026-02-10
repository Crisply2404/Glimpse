
import React, { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import InputArea from './components/InputArea';
import Visualizer from './components/Visualizer';
import Results from './components/Results';
import GachaMachine from './components/GachaMachine';
import { Clue, Phase, SearchState, SearchEvent } from './types';
import { INITIAL_CANDIDATES, MOCK_EVENTS } from './constants';

const App: React.FC = () => {
  // Default to light mode
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [state, setState] = useState<SearchState>({
    isProcessing: false,
    currentPhase: Phase.IDLE,
    events: [],
    candidates: INITIAL_CANDIDATES,
    visibleResults: [],
  });

  // Ensure theme class is correctly applied to document element on mount and change
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const clearAll = useCallback(() => {
    setState({
      isProcessing: false,
      currentPhase: Phase.IDLE,
      events: [],
      candidates: INITIAL_CANDIDATES,
      visibleResults: [],
    });
  }, []);

  const runSearchSequence = useCallback(async () => {
    if (state.isProcessing) return;

    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      events: [], 
      visibleResults: [],
      currentPhase: Phase.SEARCHING,
      candidates: INITIAL_CANDIDATES.map(c => ({ ...c, isEliminated: false }))
    }));

    // Step-by-step simulation
    for (let i = 0; i < MOCK_EVENTS.length; i++) {
      const event = MOCK_EVENTS[i];
      
      // Artificial delay for realism
      await new Promise(resolve => setTimeout(resolve, 1500));

      setState(prev => {
        const newEvents = [...prev.events, { ...event, id: `event-${Date.now()}-${i}`, timestamp: Date.now() }];
        
        // Custom logic to eliminate some candidates based on mock phase
        let updatedCandidates = [...prev.candidates];
        if (event.phase === Phase.FILTERING) {
          updatedCandidates = updatedCandidates.map(c => 
            parseInt(c.id) > 5 ? { ...c, isEliminated: true } : c
          );
        }

        return {
          ...prev,
          events: newEvents,
          currentPhase: event.phase,
          candidates: updatedCandidates
        };
      });

      // Special handling for Gacha
      if (event.phase === Phase.GACHA) {
         break;
      }
    }
  }, [state.isProcessing]);

  const handleReveal = useCallback(() => {
    setState(prev => {
      const top5 = prev.candidates.filter(c => !c.isEliminated).slice(0, 5);
      const currentlyRevealed = prev.visibleResults.length;
      if (currentlyRevealed >= top5.length) {
        return { ...prev, isProcessing: false, currentPhase: Phase.COMPLETE };
      }
      return {
        ...prev,
        visibleResults: [...prev.visibleResults, top5[currentlyRevealed].id]
      };
    });
  }, []);

  return (
    <div className="min-h-screen pb-20 selection:bg-indigo-100 selection:text-indigo-900 transition-colors duration-300 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header theme={theme} onToggleTheme={toggleTheme} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-12">
        {/* Intro Section */}
        <section className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight">
            Find the <span className="text-indigo-600 dark:text-indigo-400">Lost</span> In Your Mind
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-lg">
            Glimpse uses neural scraping and fuzzy search patterns to visualize the recovery of your childhood gaming memories.
          </p>
        </section>

        {/* Input Area */}
        <section>
          <InputArea 
            onStart={runSearchSequence} 
            onClear={clearAll} 
            onReplay={runSearchSequence}
            isProcessing={state.isProcessing}
          />
        </section>

        {/* Visualization Area */}
        <section className="pt-10 border-t border-zinc-100 dark:border-zinc-800">
           <Visualizer 
              events={state.events} 
              candidates={state.candidates}
              currentPhase={state.currentPhase}
           />
        </section>

        {/* Gacha Drop Machine */}
        {(state.currentPhase === Phase.GACHA || state.currentPhase === Phase.COMPLETE) && (
          <section className="flex justify-center">
            <GachaMachine 
              isRolling={state.currentPhase === Phase.GACHA}
              onReveal={handleReveal}
              revealedCount={state.visibleResults.length}
              totalToReveal={5}
            />
          </section>
        )}

        {/* Results Area */}
        <section>
          <Results 
            candidates={state.candidates} 
            revealedIds={state.visibleResults}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-zinc-100 dark:border-zinc-800 py-10 text-center text-zinc-400 text-sm">
        <p>© 2024 Glimpse Engine • Powered by Fragmented Memories</p>
      </footer>
    </div>
  );
};

export default App;
