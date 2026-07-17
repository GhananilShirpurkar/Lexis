import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Sparkles } from './icons';

const SidebarNudgeBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user || user.onboarding_completed) {
    return null;
  }

  const handleResume = () => {
    // Clear previous tour progress to start fresh per spec
    localStorage.removeItem('lexis_spotlight_tour_step');
    navigate('/onboarding', { state: { forceResume: true } });
  };

  return (
    <div className="mx-3 my-2 p-3 bg-gradient-to-r from-cyan-950/40 via-cyan-900/20 to-cyan-950/35 border border-cyan-500/30 rounded-xl glass-panel relative overflow-hidden group shadow-lg">
      <div className="flex items-start gap-2.5">
        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20 shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-gray-200 truncate">Setup Incomplete</h4>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
            Complete your profile to unlock full team collaboration.
          </p>
          <button
            onClick={handleResume}
            className="mt-2.5 w-full text-xs font-medium py-1.5 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
          >
            <User className="w-3.5 h-3.5" />
            <span>Complete Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidebarNudgeBanner;
