import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import SpotlightTour from '../components/SpotlightTour';
import { User, Sparkles, CheckCircle, Upload, ArrowRight, BookOpen, AlertTriangle } from '../components/icons';

const ROLES = [
  'Student',
  'Researcher',
  'Legal Professional',
  'Developer',
  'Other'
];

const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80'
];

const OnboardingPage = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isResuming = location.state?.forceResume || false;

  // Form state
  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [role, setRole] = useState(user?.role || 'Researcher');

  // Validation state
  const [usernameStatus, setUsernameStatus] = useState({ checking: false, available: null, reason: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step state: 1 = Form, 2 = Tour Choice / Spotlight, 3 = Celebratory Complete Prompt
  const [step, setStep] = useState(1);
  const [showSpotlight, setShowSpotlight] = useState(false);

  // Debounced Username availability check
  useEffect(() => {
    if (!username.trim()) {
      setUsernameStatus({ checking: false, available: null, reason: '' });
      return;
    }

    const regex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!regex.test(username.trim())) {
      setUsernameStatus({
        checking: false,
        available: false,
        reason: '3-30 chars, alphanumeric & underscores only'
      });
      return;
    }

    const timer = setTimeout(async () => {
      setUsernameStatus(prev => ({ ...prev, checking: true }));
      try {
        const res = await apiClient.get(`/users/check-username?username=${encodeURIComponent(username.trim())}`);
        setUsernameStatus({
          checking: false,
          available: res.data.available,
          reason: res.data.reason || ''
        });
      } catch (err) {
        setUsernameStatus({
          checking: false,
          available: false,
          reason: 'Failed to check username availability'
        });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  // Handle Avatar File Upload
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Image size must be less than 2MB');
      return;
    }

    setIsUploadingAvatar(true);
    setErrorMsg('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAvatarUrl(res.data.avatar_url);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to upload avatar image');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Submit Profile Setup
  const handleSubmitProfile = async (e) => {
    e.preventDefault();
    if (!usernameStatus.available && username !== user?.username) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await apiClient.patch('/users/me/onboarding', {
        username: username.trim(),
        display_name: displayName.trim() || username.trim(),
        avatar_url: avatarUrl,
        role: role,
        skip: false
      });

      await refreshUser();
      setStep(2);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Skip Profile Setup
  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.patch('/users/me/onboarding', { skip: true });
      await refreshUser();
      navigate('/query', { state: { skippedOnboarding: true } });
    } catch (err) {
      console.error('Failed to skip onboarding:', err);
      navigate('/query');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartTour = () => {
    setShowSpotlight(true);
  };

  const handleTourFinished = () => {
    setShowSpotlight(false);
    setStep(3);
  };

  const handleFinishOnboarding = () => {
    navigate('/query', { state: { justOnboarded: true } });
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-bg-glow" />

      {/* Main Card */}
      <div className="onboarding-card glass-panel">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">
            <BookOpen className="icon text-accent" />
            <span>LEXIS</span>
          </div>

          <div className="onboarding-steps">
            <span className={`step-badge ${step === 1 ? 'active' : ''}`}>1. Profile</span>
            <span>&rarr;</span>
            <span className={`step-badge ${step === 2 ? 'active' : ''}`}>2. Tour</span>
            <span>&rarr;</span>
            <span className={`step-badge ${step === 3 ? 'active' : ''}`}>3. Ready</span>
          </div>
        </div>

        {/* STEP 1: Form */}
        {step === 1 && (
          <form onSubmit={handleSubmitProfile} className="onboarding-body">
            <div>
              <h1 className="onboarding-title">Welcome to LEXIS! 🎉</h1>
              <p className="onboarding-subtitle">
                Let's set up your profile to personalize your RAG search workspace.
              </p>
            </div>

            {errorMsg && (
              <div className="auth-error-banner" role="alert">
                <AlertTriangle className="icon-sm text-danger" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Avatar Upload */}
            <div className="auth-input-group">
              <label className="auth-field-label">PROFILE AVATAR</label>
              <div className="avatar-upload-box">
                <div className="avatar-preview-circle">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="avatar-preview-img" />
                  ) : (
                    <span>{(displayName || username || user?.email || 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="avatar-actions">
                  <label className="btn outline-btn btn-sm cursor-pointer inline-flex items-center gap-2">
                    <Upload className="icon-xs" />
                    <span>{isUploadingAvatar ? 'Uploading...' : 'Upload Image'}</span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
                  </label>
                  <span className="info-key" style={{ fontSize: '11px' }}>PNG, JPG or WEBP (max 2MB)</span>
                </div>
              </div>

              {/* Presets */}
              <div className="presets-row">
                <span className="info-key" style={{ fontSize: '12px' }}>Preset:</span>
                {DEFAULT_AVATARS.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={`preset-avatar-btn ${avatarUrl === url ? 'selected' : ''}`}
                  >
                    <img src={url} alt="Preset" />
                  </button>
                ))}
              </div>
            </div>

            {/* Username */}
            <div className="auth-input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="auth-field-label">USERNAME *</label>
                {usernameStatus.checking && <span style={{ fontSize: '11px', color: 'var(--color-mute)' }}>Checking...</span>}
                {!usernameStatus.checking && usernameStatus.available === true && (
                  <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: '600' }}>✓ Available</span>
                )}
                {!usernameStatus.checking && usernameStatus.available === false && (
                  <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>{usernameStatus.reason}</span>
                )}
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_lexis"
                required
                className="auth-text-input"
              />
            </div>

            {/* Display Name */}
            <div className="auth-input-group">
              <label className="auth-field-label">DISPLAY NAME (OPTIONAL)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={username || "How you'll appear in Lexis"}
                className="auth-text-input"
              />
            </div>

            {/* Role */}
            <div className="auth-input-group">
              <label className="auth-field-label">PRIMARY ROLE / USE CASE</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="auth-text-input"
                style={{ backgroundColor: 'var(--color-canvas-soft)', color: 'var(--color-ink)' }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} style={{ background: '#191919', color: '#fff' }}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="onboarding-btn-row">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className="btn outline-btn"
                style={{ flex: 1 }}
              >
                Skip for now
              </button>

              <button
                type="submit"
                disabled={isSubmitting || (!usernameStatus.available && username !== user?.username)}
                className="btn primary-btn"
                style={{ flex: 2 }}
              >
                <span>{isSubmitting ? 'Saving...' : 'Continue'}</span>
                <ArrowRight className="icon-sm" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Tour Option */}
        {step === 2 && (
          <div className="onboarding-body" style={{ textAlign: 'center', alignItems: 'center' }}>
            <div className="avatar-preview-circle" style={{ width: 80, height: 80, margin: '0 auto' }}>
              <Sparkles className="icon-lg text-accent" />
            </div>

            <div>
              <h2 className="onboarding-title">Profile Updated!</h2>
              <p className="onboarding-subtitle" style={{ maxWidth: 360, margin: '8px auto 0 auto' }}>
                Would you like a 60-second interactive tour of the LEXIS RAG interface?
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 16 }}>
              <button
                onClick={handleStartTour}
                className="btn primary-btn btn-full"
              >
                <Sparkles className="icon-sm" />
                <span>Take Interactive Tour</span>
              </button>

              <button
                onClick={handleFinishOnboarding}
                className="btn outline-btn btn-full"
              >
                Skip Tour & Go to Workspace
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Completion */}
        {step === 3 && (
          <div className="onboarding-body" style={{ textAlign: 'center', alignItems: 'center' }}>
            <div className="avatar-preview-circle" style={{ width: 80, height: 80, margin: '0 auto', borderColor: 'var(--color-success)' }}>
              <CheckCircle className="icon-lg text-success" />
            </div>

            <div>
              <h2 className="onboarding-title">You're All Set! 🎉</h2>
              <p className="onboarding-subtitle" style={{ maxWidth: 360, margin: '8px auto 0 auto' }}>
                Your profile is active. Start querying your documents or perform live web searches.
              </p>
            </div>

            <button
              onClick={handleFinishOnboarding}
              className="btn primary-btn btn-full"
              style={{ marginTop: 16 }}
            >
              <span>Go to Query Workspace</span>
              <ArrowRight className="icon-sm" />
            </button>
          </div>
        )}
      </div>

      {/* Tour Modal */}
      <SpotlightTour
        isOpen={showSpotlight}
        onComplete={handleTourFinished}
        onSkip={handleTourFinished}
      />
    </div>
  );
};

export default OnboardingPage;
