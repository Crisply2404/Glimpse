
import React from 'react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme }) => {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 transform rotate-3">
              <i className="fa-solid fa-eye text-white text-xl"></i>
            </div>
            <span className="text-xl font-black tracking-tighter text-zinc-900 dark:text-zinc-50">GLIMPSE</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6">
              <a href="#" className="text-sm font-medium text-zinc-500 hover:text-indigo-600 transition-colors">Documentation</a>
              <a href="#" className="text-sm font-medium text-zinc-500 hover:text-indigo-600 transition-colors">History</a>
            </div>
            
            <button 
              onClick={onToggleTheme}
              className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:scale-110 active:scale-95 transition-all"
              aria-label="Toggle Theme"
            >
              <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'} w-5 h-5 flex items-center justify-center`}></i>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Header;
