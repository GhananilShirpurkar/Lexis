import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LexisLogo, CheckCircle } from '../components/icons';

const AuthPage = () => {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  // Email format validation
  const validateEmail = (val) => {
    if (!val) {
      setEmailError('Email is required');
      return false;
    }
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(val)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  // Password length validation
  const validatePassword = (val) => {
    if (!val) {
      setPasswordError('Password is required');
      return false;
    }
    if (val.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return false;
    }
    setPasswordError('');
    return true;
  };

  // Password confirmation validation
  const validateConfirmPassword = (val) => {
    if (!isLogin && val !== password) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError('');
    return true;
  };

  // Run validation on inputs change
  useEffect(() => {
    if (email) validateEmail(email);
  }, [email]);

  useEffect(() => {
    if (password) validatePassword(password);
    if (confirmPassword) validateConfirmPassword(confirmPassword);
  }, [password, confirmPassword, isLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmValid = isLogin || validateConfirmPassword(confirmPassword);

    if (!isEmailValid || !isPasswordValid || !isConfirmValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'string' 
        ? detail 
        : detail?.error?.message || 'Authentication failed. Please check your credentials.';
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('demo@lexis.internal');
    setPassword('LexisPass2024!');
    setConfirmPassword('LexisPass2024!');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setServerError('');
  };

  const isFormInvalid = 
    !email || 
    !password || 
    !!emailError || 
    !!passwordError || 
    (!isLogin && (!confirmPassword || !!confirmPasswordError)) ||
    isSubmitting;

  return (
    <div className="lexis-auth-screen">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* LEFT / BRAND PANEL (~50% width)                               */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="auth-brand-panel">
        {/* Top Brand Lockup */}
        <div className="brand-panel-header">
          <div className="brand-lockup">
            <div className="brand-logo-frame">
              <LexisLogo size={22} />
            </div>
            <span className="brand-name">Lexis</span>
            <span className="brand-badge">Document Intelligence</span>
          </div>
        </div>

        {/* Brand Statement & Core Principles */}
        <div className="brand-panel-main">
          <div className="brand-statement-group">
            <h1 className="brand-headline">
              Understand documents.<br />
              Verify every claim.
            </h1>
            <p className="brand-supporting">
              AI-powered document intelligence for research, analysis, and evidence-backed answers.
            </p>
          </div>

          {/* Three Compact Principles (01, 02, 03) */}
          <div className="brand-principles">
            <div className="principle-item">
              <span className="principle-number">01</span>
              <div className="principle-content">
                <h2 className="principle-title">Grounded answers</h2>
                <p className="principle-desc">Retrieve answers directly from your source material.</p>
              </div>
            </div>

            <div className="principle-item">
              <span className="principle-number">02</span>
              <div className="principle-content">
                <h2 className="principle-title">Verifiable citations</h2>
                <p className="principle-desc">Trace claims back to the exact supporting passage.</p>
              </div>
            </div>

            <div className="principle-item">
              <span className="principle-number">03</span>
              <div className="principle-content">
                <h2 className="principle-title">Research at scale</h2>
                <p className="principle-desc">Analyze complex document collections without losing context.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Credibility Statement */}
        <div className="brand-panel-footer">
          <blockquote className="brand-quote">
            <p className="quote-text">
              “Lexis has transformed how our research and legal teams analyze complex filings. Every single claim is grounded with instant citation verification down to the page.”
            </p>
            <footer className="quote-byline">
              <div className="quote-avatar">SC</div>
              <div className="quote-meta">
                <span className="quote-name">Sofia Chen</span>
                <span className="quote-role">Head of Research · Paradigm</span>
              </div>
            </footer>
          </blockquote>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* RIGHT / AUTH PANEL (~50% width)                                */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="auth-form-panel">
        {/* Top-Right Alternate Auth Action */}
        <div className="auth-panel-top">
          <button
            type="button"
            className="auth-switch-link"
            onClick={() => {
              setIsLogin(!isLogin);
              setServerError('');
              setEmailError('');
              setPasswordError('');
              setConfirmPasswordError('');
            }}
          >
            {isLogin ? (
              <>
                <span className="switch-prompt">Don't have an account?</span>
                <span className="switch-action">Sign up</span>
              </>
            ) : (
              <>
                <span className="switch-prompt">Already have an account?</span>
                <span className="switch-action">Sign in</span>
              </>
            )}
          </button>
        </div>

        {/* Centered Auth Content Wrapper */}
        <div className="auth-form-wrapper">
          <div className="auth-form-header">
            <span className="auth-eyebrow">
              {isLogin ? 'WELCOME BACK' : 'GET STARTED'}
            </span>
            <h2 className="auth-heading">
              {isLogin ? 'Sign in to Lexis' : 'Create your Lexis account'}
            </h2>
            <p className="auth-subheading">
              {isLogin
                ? 'Continue your research and document analysis.'
                : 'Start researching, analyzing, and understanding your documents.'}
            </p>
          </div>

          {/* Info Banner */}
          {location.state?.message && !serverError && (
            <div className="auth-banner-info" role="status">
              <CheckCircle className="icon-sm" style={{ color: '#10b981', flexShrink: 0 }} />
              <span>{location.state.message}</span>
            </div>
          )}

          {/* Server Error Alert */}
          {serverError && (
            <div className="auth-banner-error" role="alert">
              <span>{serverError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="auth-form-element">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`form-input ${emailError ? 'input-invalid' : ''}`}
                autoComplete="email"
                required
              />
              {emailError && (
                <span className="form-error-msg">{emailError}</span>
              )}
            </div>

            <div className="form-group">
              <div className="label-with-action">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`form-input ${passwordError ? 'input-invalid' : ''}`}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
              />
              {passwordError && (
                <span className="form-error-msg">{passwordError}</span>
              )}
            </div>

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`form-input ${confirmPasswordError ? 'input-invalid' : ''}`}
                  autoComplete="new-password"
                  required
                />
                {confirmPasswordError && (
                  <span className="form-error-msg">{confirmPasswordError}</span>
                )}
              </div>
            )}

            {/* Primary Submit CTA */}
            <button
              type="submit"
              className="auth-primary-btn"
              disabled={isFormInvalid}
            >
              {isSubmitting ? (
                <span className="btn-spinner-text">Authenticating...</span>
              ) : isLogin ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Secondary / Demo Action */}
          <div className="auth-secondary-actions">
            <button
              type="button"
              className="auth-demo-action"
              onClick={handleFillDemo}
            >
              Use demo credentials
            </button>
          </div>

          {/* Secondary Switch Link */}
          <div className="auth-bottom-switch">
            <button
              type="button"
              className="auth-inline-toggle"
              onClick={() => {
                setIsLogin(!isLogin);
                setServerError('');
                setEmailError('');
                setPasswordError('');
                setConfirmPasswordError('');
              }}
            >
              {isLogin ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </div>

          {/* Legal Copy */}
          <p className="auth-legal-copy">
            By continuing, you agree to the{' '}
            <span className="legal-link">Terms of Service</span> and{' '}
            <span className="legal-link">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
