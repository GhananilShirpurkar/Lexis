import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OnboardingGuard = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0B0F17] text-gray-200">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-400">Loading LEXIS...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const isOnboardingRoute = location.pathname === '/onboarding';
  const needsOnboarding = !user.onboarding_completed && !user.onboarding_skipped_at;

  if (needsOnboarding && !isOnboardingRoute) {
    return <Navigate to="/onboarding" replace />;
  }

  if (user.onboarding_completed && isOnboardingRoute) {
    // If completed and navigated directly to /onboarding without state, redirect to query
    if (!location.state?.forceResume) {
      return <Navigate to="/query" replace />;
    }
  }

  return children;
};

export default OnboardingGuard;
