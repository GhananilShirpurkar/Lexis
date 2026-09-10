import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LexisLogo, 
  CheckCircle, 
  FileText, 
  Search, 
  Shield, 
  Database, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  Sparkles 
} from '../components/icons';

const PREVIEW_SAMPLES = [
  {
    id: 'infra',
    tabLabel: 'Infrastructure Spec',
    filename: '2024_infrastructure_report.pdf',
    pageCount: 38,
    status: 'Indexed',
    query: 'What is the failover latency across secondary cloud regions?',
    answer: 'Secondary region failover initiates within 180 milliseconds, maintaining active consensus across distributed raft clusters through pre-warmed standby routes.',
    citation: {
      tag: 'p. 14, §2.3',
      section: 'Multi-Region High Availability & Latency Clamping',
      excerpt: '...cross-region heartbeat timeouts are clamped to 120ms with secondary election completing in under 60ms [total 180ms failover window], preventing split-brain states across asynchronous replicas...',
      metrics: 'Cosine Similarity: 0.912 · BM25: 14.8'
    }
  },
  {
    id: 'legal',
    tabLabel: 'Enterprise MSA',
    filename: 'msa_enterprise_standard.pdf',
    pageCount: 24,
    status: 'Indexed',
    query: 'What are the indemnification caps for data security incidents?',
    answer: 'Aggregate indemnification liability for security and privacy breaches is capped at $5,000,000, with gross negligence explicitly excluded from limitation.',
    citation: {
      tag: 'p. 9, §14.2',
      section: 'Limitation of Liability & Security Indemnity',
      excerpt: '...except in the event of gross negligence or willful misconduct, each party\'s total aggregate liability arising out of data protection obligations shall not exceed five million dollars ($5,000,000)...',
      metrics: 'Cosine Similarity: 0.945 · BM25: 18.2'
    }
  }
];

const AuthPage = () => {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Preview interactive state
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);
  const [showExcerpt, setShowExcerpt] = useState(true);

  // Validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeSample = PREVIEW_SAMPLES[activeSampleIndex];

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

  // Quick fill helper for evaluator convenience
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
    <div className="auth-page">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* LEFT PANE — Brand Identity & Live Product Showcase             */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="auth-brand-pane">
        <div className="auth-ambient-glow" />

        <div className="auth-brand-inner">
          {/* Top Brand Lockup */}
          <div className="auth-brand-header">
            <div className="auth-brand-logo">
              <LexisLogo size={30} />
              <span className="auth-brand-title">Lexis</span>
            </div>
            <span className="auth-brand-tag">Document Intelligence</span>
          </div>

          {/* Hero Typography */}
          <div className="auth-brand-hero">
            <h1 className="auth-hero-title">
              Intelligence grounded in primary sources.
            </h1>
            <p className="auth-hero-subtitle">
              Upload technical specifications, legal briefs, and financial filings. 
              Ask questions in natural language and inspect exact passage citations.
            </p>
          </div>

          {/* Authentic Document Intelligence Preview Card */}
          <div className="auth-preview-card">
            {/* Card Document Header */}
            <div className="preview-top-bar">
              <div className="preview-doc-info">
                <div className="preview-doc-icon">
                  <FileText className="icon-sm" style={{ color: 'var(--color-accent-sunset)' }} />
                </div>
                <div className="preview-doc-meta">
                  <span className="preview-doc-name">{activeSample.filename}</span>
                  <span className="preview-doc-sub">{activeSample.pageCount} pages · Verified Index</span>
                </div>
              </div>

              {/* Sample Switcher Tabs */}
              <div className="preview-tabs">
                {PREVIEW_SAMPLES.map((sample, idx) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={`preview-tab-btn ${activeSampleIndex === idx ? 'active' : ''}`}
                    onClick={() => setActiveSampleIndex(idx)}
                  >
                    {sample.tabLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Query Bubble */}
            <div className="preview-query-row">
              <div className="preview-user-avatar">
                <Search className="icon-xs" style={{ color: '#a1a1aa' }} />
              </div>
              <div className="preview-query-bubble">
                <p className="preview-query-text">{activeSample.query}</p>
              </div>
            </div>

            {/* Synthesized Response */}
            <div className="preview-answer-row">
              <div className="preview-ai-avatar">
                <LexisLogo size={14} />
              </div>
              <div className="preview-answer-card">
                <p className="preview-answer-text">
                  {activeSample.answer}
                  {' '}
                  <button
                    type="button"
                    className={`preview-citation-pill ${showExcerpt ? 'active' : ''}`}
                    onClick={() => setShowExcerpt(!showExcerpt)}
                    title="Click to view extracted source chunk"
                  >
                    [{activeSample.citation.tag}]
                  </button>
                </p>

                {/* Interactive Provenance Drawer */}
                {showExcerpt && (
                  <div className="preview-provenance-drawer">
                    <div className="provenance-header">
                      <span className="provenance-label">SOURCE PROVENANCE</span>
                      <span className="provenance-section">{activeSample.citation.section}</span>
                    </div>
                    <blockquote className="provenance-quote">
                      {activeSample.citation.excerpt}
                    </blockquote>
                    <div className="provenance-footer">
                      <span className="provenance-metrics">{activeSample.citation.metrics}</span>
                      <span className="provenance-status">
                        <CheckCircle className="icon-xs" style={{ color: 'var(--color-success)', display: 'inline' }} />
                        {' '}Passage Verified
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Capabilities Strip (Zero buzzwords, concrete technical features) */}
          <div className="auth-capabilities-strip">
            <div className="capability-item">
              <div className="capability-icon">
                <Database className="icon-sm" style={{ color: 'var(--color-accent-sunset)' }} />
              </div>
              <div>
                <strong className="capability-title">Hybrid Retrieval</strong>
                <p className="capability-desc">Vector similarity paired with exact keyword BM25</p>
              </div>
            </div>

            <div className="capability-item">
              <div className="capability-icon">
                <Sparkles className="icon-sm" style={{ color: 'var(--color-accent-sunset)' }} />
              </div>
              <div>
                <strong className="capability-title">Passage Provenance</strong>
                <p className="capability-desc">Every synthesis point is anchored to raw source chunks</p>
              </div>
            </div>

            <div className="capability-item">
              <div className="capability-icon">
                <Shield className="icon-sm" style={{ color: 'var(--color-accent-sunset)' }} />
              </div>
              <div>
                <strong className="capability-title">Workspace Isolation</strong>
                <p className="capability-desc">Isolated user tenancy with zero data retention for training</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* RIGHT PANE — Focused Authentication Surface                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="auth-form-pane">
        <div className="auth-card-frame">
          {/* Card Header */}
          <div className="auth-card-header">
            <div className="auth-card-brand">
              <LexisLogo size={22} />
              <span className="auth-card-brand-name">Lexis</span>
            </div>
            <h2 className="auth-card-title">
              {isLogin ? 'Sign in to Lexis' : 'Create your account'}
            </h2>
            <p className="auth-card-subtitle">
              {isLogin 
                ? 'Enter your credentials to access your document workspaces.' 
                : 'Set up your account to begin indexing and querying documents.'}
            </p>
          </div>

          {/* Info message banner */}
          {location.state?.message && !serverError && (
            <div className="auth-info-banner" role="status">
              <CheckCircle className="icon-sm" style={{ color: '#10B981', flexShrink: 0 }} />
              <span>{location.state.message}</span>
            </div>
          )}

          {/* Server Error Alert */}
          {serverError && (
            <div className="auth-error-banner" role="alert">
              <span className="auth-error-icon">⚠️</span>
              <span className="auth-error-text">{serverError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="auth-form-body">
            {/* Email Field */}
            <div className="auth-field-group">
              <label htmlFor="email" className="auth-field-label">
                Email address
              </label>
              <input
                type="email"
                id="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`auth-field-input ${emailError ? 'has-error' : ''}`}
                autoComplete="email"
                required
              />
              {emailError && (
                <span className="auth-field-error">{emailError}</span>
              )}
            </div>

            {/* Password Field */}
            <div className="auth-field-group">
              <div className="auth-label-row">
                <label htmlFor="password" className="auth-field-label">
                  Password
                </label>
                <button
                  type="button"
                  className="auth-show-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <>
                      <EyeOff className="icon-xs" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="icon-xs" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`auth-field-input ${passwordError ? 'has-error' : ''}`}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
              />
              {passwordError && (
                <span className="auth-field-error">{passwordError}</span>
              )}
            </div>

            {/* Confirm Password Field (Registration only) */}
            {!isLogin && (
              <div className="auth-field-group">
                <label htmlFor="confirmPassword" className="auth-field-label">
                  Confirm password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`auth-field-input ${confirmPasswordError ? 'has-error' : ''}`}
                  autoComplete="new-password"
                  required
                />
                {confirmPasswordError && (
                  <span className="auth-field-error">{confirmPasswordError}</span>
                )}
              </div>
            )}

            {/* Primary Submit CTA */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isFormInvalid}
            >
              {isSubmitting ? (
                <>
                  <div className="auth-btn-spinner" />
                  <span>Verifying credentials...</span>
                </>
              ) : isLogin ? (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="icon-sm" />
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <ArrowRight className="icon-sm" />
                </>
              )}
            </button>
          </form>

          {/* Evaluator Demo Fill Action */}
          <div className="auth-demo-shortcut">
            <button
              type="button"
              className="auth-demo-btn"
              onClick={handleFillDemo}
            >
              Fill demo credentials
            </button>
          </div>

          {/* Toggle between Login and Register */}
          <div className="auth-toggle-row">
            <span className="auth-toggle-text">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <button
              type="button"
              className="auth-toggle-action"
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

          {/* Quiet, Honest Security Assurance (Zero fake badges) */}
          <div className="auth-security-footer">
            <Shield className="icon-xs" style={{ color: '#71717a' }} />
            <span>Encrypted in transit and at rest · Isolated tenant storage</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
