import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import OnboardingGuard from './components/OnboardingGuard';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import Dashboard from './pages/Dashboard';
import DevConsole from './pages/DevConsole';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import BillingPage from './pages/BillingPage';
import LibraryPage from './pages/LibraryPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <OnboardingPage />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <Dashboard />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <LibraryPage />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dev-console"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <DevConsole />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <ProfilePage />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <SettingsPage />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <OnboardingGuard>
                  <BillingPage />
                </OnboardingGuard>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
