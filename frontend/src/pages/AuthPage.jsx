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
      // Successful auth triggers redirect via the useEffect hook observing user state
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

  // Check if form has errors or is empty
  const isFormInvalid = 
    !email || 
    !password || 
    !!emailError || 
    !!passwordError || 
    (!isLogin && (!confirmPassword || !!confirmPasswordError)) ||
    isSubmitting;

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo-icon">📚</span>
          <h1 className="auth-logo-text">Lexis</h1>
          <p className="auth-subtitle">
            {isLogin ? 'Welcome back. Sign in to your workspace.' : 'Create an account to get started.'}
          </p>
        </div>

        {serverError && (
          <div className="auth-error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={emailError ? 'input-error' : ''}
              required
            />
            {emailError && <span className="field-error">{emailError}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={passwordError ? 'input-error' : ''}
              required
            />
            {passwordError && <span className="field-error">{passwordError}</span>}
          </div>

          {!isLogin && (
            <div className="input-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={confirmPasswordError ? 'input-error' : ''}
                required
              />
              {confirmPasswordError && <span className="field-error">{confirmPasswordError}</span>}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isFormInvalid}
          >
            {isSubmitting ? (
              <span className="spinner">Processing...</span>
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-toggle">
          <span>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setIsLogin(!isLogin);
              setServerError('');
              setEmailError('');
              setPasswordError('');
              setConfirmPasswordError('');
            }}
          >
            {isLogin ? 'Sign up free' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
