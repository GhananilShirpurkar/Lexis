import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles, CheckCircle } from './icons';

const TOUR_STOPS = [
  {
    target: '#nav-query',
    title: 'Query Tab',
    content: 'Start conversations, upload documents, and search your indexed knowledge base.',
    placement: 'bottom'
  },
  {
    target: '#nav-library',
    title: 'Library Tab',
    content: 'All your uploaded PDFs, DOCX, and text files live here — organized and searchable.',
    placement: 'bottom'
  },
  {
    target: '#nav-console',
    title: 'Console',
    content: 'Monitor system status, view real-time vector embeddings, and track API logs.',
    placement: 'bottom'
  },
  {
    target: '#nav-settings',
    title: 'Settings',
    content: 'Customize your RAG parameters, select LLM models, and manage your API keys.',
    placement: 'bottom'
  },
  {
    target: '#web-search-toggle',
    title: 'Web Search Toggle',
    content: 'Augment your documents with real-time web search results for live market research.',
    placement: 'top'
  }
];

const SpotlightTour = ({ isOpen, onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem('lexis_spotlight_tour_step');
    return saved ? Math.min(parseInt(saved, 10), TOUR_STOPS.length - 1) : 0;
  });

  const [rect, setRect] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Responsive check
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync step target rectangle
  const updateRect = useCallback(() => {
    if (!isOpen) return;
    const stop = TOUR_STOPS[currentStep];
    const el = document.querySelector(stop.target);
    if (el) {
      const b = el.getBoundingClientRect();
      setRect({
        top: b.top + window.scrollY,
        left: b.left + window.scrollX,
        width: b.width,
        height: b.height
      });
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setRect(null);
    }
  }, [isOpen, currentStep]);

  useLayoutEffect(() => {
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, [updateRect]);

  useEffect(() => {
    if (isOpen) {
      localStorage.setItem('lexis_spotlight_tour_step', currentStep.toString());
    }
  }, [isOpen, currentStep]);

  const handleNext = () => {
    if (currentStep < TOUR_STOPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.removeItem('lexis_spotlight_tour_step');
    if (onComplete) onComplete();
  };

  const handleSkip = () => {
    localStorage.removeItem('lexis_spotlight_tour_step');
    if (onSkip) onSkip();
  };

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const currentStop = TOUR_STOPS[currentStep];
  const padding = 8;

  // Calculate tooltip placement
  let tooltipStyle = {};
  if (isMobile) {
    tooltipStyle = {
      position: 'fixed',
      bottom: '24px',
      left: '16px',
      right: '16px',
      zIndex: 9999
    };
  } else if (rect) {
    const topSpace = rect.top;
    const isTopPlacement = currentStop.placement === 'top' || topSpace > window.innerHeight - 250;
    
    if (isTopPlacement) {
      tooltipStyle = {
        position: 'absolute',
        top: `${Math.max(16, rect.top - 180)}px`,
        left: `${Math.max(16, Math.min(rect.left, window.innerWidth - 380))}px`,
        zIndex: 9999
      };
    } else {
      tooltipStyle = {
        position: 'absolute',
        top: `${rect.top + rect.height + 16}px`,
        left: `${Math.max(16, Math.min(rect.left, window.innerWidth - 380))}px`,
        zIndex: 9999
      };
    }
  } else {
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 9999
    };
  }

  return (
    <div className="spotlight-tour-overlay fixed inset-0 z-[9990] overflow-hidden pointer-events-auto">
      {/* SVG Cutout Overlay with 300ms transition */}
      <svg className="w-full h-full absolute inset-0 pointer-events-none">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - padding}
                y={rect.top - padding}
                width={rect.width + padding * 2}
                height={rect.height + padding * 2}
                rx="12"
                fill="black"
                style={{ transition: 'all 300ms ease-out' }}
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(5, 8, 15, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Animated Glowing Ring around Highlighted Element */}
      {rect && (
        <div
          className="absolute pointer-events-none border-2 border-cyan-400/90 shadow-[0_0_20px_rgba(6,182,212,0.6)] rounded-xl"
          style={{
            top: `${rect.top - padding}px`,
            left: `${rect.left - padding}px`,
            width: `${rect.width + padding * 2}px`,
            height: `${rect.height + padding * 2}px`,
            transition: 'all 300ms ease-out'
          }}
        />
      )}

      {/* Tooltip Card */}
      <div
        style={tooltipStyle}
        className="w-full max-w-[360px] bg-[#0F172A]/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-5 shadow-2xl text-gray-100 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="text-xs font-semibold text-cyan-400 tracking-wider uppercase">
              Step {currentStep + 1} of {TOUR_STOPS.length}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-200 transition-colors p-1"
            title="Skip Tour (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="text-base font-bold text-white mb-1">{currentStop.title}</h3>
          <p className="text-xs text-gray-300 leading-relaxed">{currentStop.content}</p>
        </div>

        {/* Dots Indicator */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {TOUR_STOPS.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentStep ? 'w-6 bg-cyan-400' : 'w-1.5 bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-800/60 mt-1">
          <button
            onClick={handleSkip}
            className="text-xs font-medium text-gray-400 hover:text-white transition-colors px-2 py-1"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 rounded-lg border border-slate-700 transition-all active:scale-95"
                title="Previous (Left Arrow)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-xs rounded-lg shadow-md transition-all flex items-center gap-1 active:scale-95"
            >
              <span>{currentStep === TOUR_STOPS.length - 1 ? 'Finish Tour' : 'Next'}</span>
              {currentStep === TOUR_STOPS.length - 1 ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotlightTour;
