import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Sliders } from './icons';

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
    <div 
      style={{
        margin: '8px 12px',
        padding: '12px',
        backgroundColor: 'var(--color-canvas-soft)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div 
          style={{
            padding: '6px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: 'rgba(255, 122, 23, 0.1)',
            color: 'var(--color-accent-sunset)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Sliders className="icon-xs" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.3px' }}>
            Setup Incomplete
          </div>
          <p style={{ fontSize: '10px', color: 'var(--color-mute)', marginTop: '2px', lineHeight: 1.4, margin: 0 }}>
            Configure operator profile and indexing defaults.
          </p>
        </div>
      </div>
      <button
        onClick={handleResume}
        className="btn outline-btn btn-sm"
        style={{ width: '100%', fontSize: '11px', height: '28px', justifyContent: 'center' }}
      >
        <User className="icon-xs" />
        <span>Complete Profile</span>
      </button>
    </div>
  );
};

export default SidebarNudgeBanner;
