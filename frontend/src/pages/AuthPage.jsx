import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

    // Final checks
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
        : detail?.error?.message || 'An unexpected authentication error occurred.';
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormInvalid = 
    !email || 
    !password || 
    !!emailError || 
    !!passwordError || 
    (!isLogin && (!confirmPassword || !!confirmPasswordError)) ||
    isSubmitting;

  return (
    <div className="auth-page">
      {/* LEFT PANE — Brand / Visual (50%) */}
      <div className="auth-brand-pane">
        {/* Chamfered background plate behind wordmark */}
        <div className="brand-bg-plate" />

        {/* Floating Accent Amber Squares */}
        <div className="brand-floating-square" style={{ top: '15%', left: '12%' }} />
        <div className="brand-floating-square" style={{ top: '22%', right: '15%' }} />
        <div className="brand-floating-square" style={{ bottom: '20%', left: '16%' }} />
        <div className="brand-floating-square" style={{ bottom: '28%', right: '12%' }} />

        {/* Centered Brand Content */}
        <div className="brand-content">
          <h1 className="brand-wordmark">LEXIS</h1>
          <p className="brand-tagline">Retrieval-Augmented Generation Workspace</p>

          <div className="brand-bullets">
            <div className="bullet-item">
              <span className="bullet-dot" />
              <span>Upload documents and index instantly</span>
            </div>
            <div className="bullet-item">
              <span className="bullet-dot" />
              <span>Query with Gemini 1.5 Flash or Groq Llama 3</span>
            </div>
            <div className="bullet-item">
              <span className="bullet-dot" />
              <span>Cited sources with every response</span>
            </div>
          </div>
        </div>

        {/* Mascot Robot Character & Speech Bubble */}
        <div className="brand-mascot-container">
          <div className="mascot-bubble">"Welcome to Lexis! Your documents are waiting."</div>
          <div style={{ fontSize: '48px', lineHeight: 1 }}>🤖</div>
        </div>
      </div>

      {/* RIGHT PANE — Form Panel (50%) */}
      <div className="auth-form-pane">
        <div className="auth-form-container">
          {/* Header Inside Form */}
          <div className="auth-form-header">
            <div className="logo-pill" style={{ display: 'inline-flex', border: '2px solid var(--color-primary)', margin: '0 auto 12px auto' }}>
              <span style={{ fontSize: '12px' }}>📚</span>
              <span className="logo-wordmark" style={{ fontSize: '11px' }}>LEXIS</span>
            </div>
            <h2 className="auth-form-title">{isLogin ? 'Sign In' : 'Register'}</h2>
            <p className="auth-form-subtitle">
              {isLogin ? 'Authenticate to access your workspace' : 'Create new workspace access account'}
            </p>
          </div>

          {/* Modern Toast Error Banner */}
          {serverError && (
            <div className="auth-error-banner" role="alert">
              <span className="auth-error-icon">⚠️</span>
              <span className="auth-error-text">{serverError}</span>
            </div>
          )}

          {/* Form Controls */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-input-group">
              <label htmlFor="email" className="auth-field-label">EMAIL ADDRESS</label>
              <input
                type="email"
                id="email"
                placeholder="operator@lexis.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`auth-text-input ${emailError ? 'input-error' : ''}`}
                required
              />
              {emailError && (
                <span style={{ color: '#e60012', fontSize: '12px', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                  {emailError}
                </span>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="password" className="auth-field-label">PASSWORD</label>
              <div className="auth-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`auth-text-input ${passwordError ? 'input-error' : ''}`}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              {passwordError && (
                <span style={{ color: '#e60012', fontSize: '12px', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                  {passwordError}
                </span>
              )}
            </div>

            {!isLogin && (
              <div className="auth-input-group">
                <label htmlFor="confirmPassword" className="auth-field-label">CONFIRM PASSWORD</label>
                <input
                  type="password"
                  id="confirmPassword"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`auth-text-input ${confirmPasswordError ? 'input-error' : ''}`}
                  required
                />
                {confirmPasswordError && (
                  <span style={{ color: '#e60012', fontSize: '12px', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                    {confirmPasswordError}
                  </span>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="auth-button-submit"
              disabled={isFormInvalid}
            >
              {isSubmitting ? (
                <>
                  <div className="spinner" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : isLogin ? (
                'SIGN IN ➔'
              ) : (
                'CREATE ACCOUNT ➔'
              )}
            </button>
          </form>

          {/* Toggle Section */}
          <div className="auth-toggle">
            <span className="auth-toggle-text">
              {isLogin ? "Need account?" : 'Already registered?'}
            </span>
            <button
              type="button"
              className="auth-toggle-link"
              onClick={() => {
                setIsLogin(!isLogin);
                setServerError('');
                setEmailError('');
                setPasswordError('');
                setConfirmPasswordError('');
              }}
            >
              {isLogin ? 'SIGN UP FREE' : 'SIGN IN'}
            </button>
          </div>

          {/* Trust Bar */}
          <div className="auth-trust-bar">
            <span className="trust-badge">SOC 2 TYPE II</span>
            <span className="trust-badge">END-TO-END ENCRYPTED</span>
            <span className="trust-badge">AES-256</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
