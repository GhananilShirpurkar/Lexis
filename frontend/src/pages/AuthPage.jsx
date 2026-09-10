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
        : detail?.error?.message || 'Authentication failed. Please verify your credentials.';
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
    <div className="shadcn-auth-container">
      {/* Left Panel: shadcn-style brand & editorial quote */}
      <div className="shadcn-auth-sidebar">
        <div className="shadcn-sidebar-header">
          <LexisLogo size={22} />
          <span className="shadcn-sidebar-brand">Lexis</span>
        </div>

        <div className="shadcn-sidebar-quote">
          <blockquote>
            <p className="quote-body">
              “Lexis has transformed how our research and legal teams analyze complex filings. Every single claim is grounded with instant citation verification down to the page.”
            </p>
            <footer className="quote-author">
              Sofia Chen, Head of Research
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right Panel: Clean shadcn authentication form */}
      <div className="shadcn-auth-main">
        {/* Top-Right Toggle Link */}
        <div className="shadcn-top-nav">
          <button
            type="button"
            className="shadcn-ghost-btn"
            onClick={() => {
              setIsLogin(!isLogin);
              setServerError('');
              setEmailError('');
              setPasswordError('');
              setConfirmPasswordError('');
            }}
          >
            {isLogin ? 'Register' : 'Sign in'}
          </button>
        </div>

        {/* Centered Form Wrapper */}
        <div className="shadcn-form-box">
          <div className="shadcn-form-header">
            <h1 className="shadcn-form-title">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="shadcn-form-desc">
              {isLogin
                ? 'Enter your email and password to sign in'
                : 'Enter your details below to create your account'}
            </p>
          </div>

          {/* Info Banner */}
          {location.state?.message && !serverError && (
            <div className="shadcn-alert-success" role="status">
              <CheckCircle className="icon-sm" style={{ color: '#10b981', flexShrink: 0 }} />
              <span>{location.state.message}</span>
            </div>
          )}

          {/* Server Error Alert */}
          {serverError && (
            <div className="shadcn-alert-error" role="alert">
              <span>{serverError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="shadcn-form">
            <div className="shadcn-form-item">
              <label htmlFor="email" className="shadcn-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`shadcn-input ${emailError ? 'shadcn-input-error' : ''}`}
                autoComplete="email"
                required
              />
              {emailError && (
                <span className="shadcn-error-text">{emailError}</span>
              )}
            </div>

            <div className="shadcn-form-item">
              <div className="shadcn-label-row">
                <label htmlFor="password" className="shadcn-label">
                  Password
                </label>
                <button
                  type="button"
                  className="shadcn-toggle-pwd"
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
                className={`shadcn-input ${passwordError ? 'shadcn-input-error' : ''}`}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
              />
              {passwordError && (
                <span className="shadcn-error-text">{passwordError}</span>
              )}
            </div>

            {!isLogin && (
              <div className="shadcn-form-item">
                <label htmlFor="confirmPassword" className="shadcn-label">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`shadcn-input ${confirmPasswordError ? 'shadcn-input-error' : ''}`}
                  autoComplete="new-password"
                  required
                />
                {confirmPasswordError && (
                  <span className="shadcn-error-text">{confirmPasswordError}</span>
                )}
              </div>
            )}

            <button
              type="submit"
              className="shadcn-btn-primary"
              disabled={isFormInvalid}
            >
              {isSubmitting ? (
                <span>Signing in...</span>
              ) : isLogin ? (
                'Sign In with Email'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Quick Demo Fill Helper */}
          <div className="shadcn-demo-row">
            <button
              type="button"
              className="shadcn-btn-demo"
              onClick={handleFillDemo}
            >
              Fill demo credentials
            </button>
          </div>

          {/* Footer Terms */}
          <p className="shadcn-terms">
            By clicking continue, you agree to our{' '}
            <span className="shadcn-link">Terms of Service</span> and{' '}
            <span className="shadcn-link">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
