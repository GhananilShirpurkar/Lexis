import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { 
  User, Mail, Calendar, Shield, Edit2, Check, X, 
  Trash2, AlertTriangle, RefreshCw, Sparkles, FileText, Search, Database, Lock,
  Copy, ChevronDown, ChevronRight, Upload, ExternalLink, Zap
} from '../components/icons';
import apiClient from '../api/client';
import NavigationBar from '../components/NavigationBar';

const ProfilePage = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  
  const [profile, setProfile] = useState(null);
  const [usage, setUsage] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [copiedUuid, setCopiedUuid] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [isDangerOpen, setIsDangerOpen] = useState(false);

  // Delete Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profileRes, usageRes, docsRes] = await Promise.allSettled([
        apiClient.get('/users/me'),
        apiClient.get('/users/me/usage'),
        apiClient.get('/documents', { params: { limit: 3 } })
      ]);

      let userProfile = null;
      if (profileRes.status === 'fulfilled') {
        userProfile = profileRes.value.data;
        setProfile(userProfile);
        setEditName(userProfile.display_name || '');
      } else {
        throw profileRes.reason;
      }

      if (usageRes.status === 'fulfilled') {
        setUsage(usageRes.value.data);
      } else {
        setUsage({
          queries_used: userProfile?.total_queries || 0,
          queries_limit: 100,
          documents_used: userProfile?.total_documents || 0,
          documents_limit: 10,
          storage_used_mb: userProfile?.storage_used_mb || 0,
          storage_limit_mb: 100,
          plan: userProfile?.plan || 'free'
        });
      }

      if (docsRes.status === 'fulfilled' && Array.isArray(docsRes.value.data)) {
        setRecentDocs(docsRes.value.data.slice(0, 3));
      }
    } catch (err) {
      console.error('Failed to load profile data:', err);
      setSaveStatus({ type: 'error', message: 'Failed to load profile data' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editName.trim() || (profile && editName === profile.display_name)) {
      setIsEditing(false);
      return;
    }
    
    setSaving(true);
    try {
      const res = await apiClient.patch('/users/me', { 
        display_name: editName.trim() 
      });
      setProfile(res.data);
      setIsEditing(false);
      if (refreshUser) refreshUser();
      setSaveStatus({ type: 'success', message: 'Display name updated' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus({ 
        type: 'error', 
        message: err.response?.data?.detail || 'Update failed' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSaveStatus({ type: 'error', message: 'Please select a valid image file (PNG/JPG)' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setSaveStatus({ type: 'error', message: 'Image size must be under 2MB' });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setAvatarUploading(true);
    try {
      const res = await apiClient.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.avatar_url) {
        setProfile(prev => ({ ...prev, avatar_url: res.data.avatar_url }));
        if (refreshUser) await refreshUser();
        setSaveStatus({ type: 'success', message: 'Avatar updated successfully' });
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setSaveStatus({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to upload avatar'
      });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const copyToClipboard = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'uuid') {
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 2000);
    } else if (type === 'email') {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleConfirmDelete = async (e) => {
    e.preventDefault();
    if (!password || confirmText.trim() !== 'DELETE MY ACCOUNT') return;

    setDeleting(true);
    setDeleteError('');

    try {
      await apiClient.delete('/users/me', {
        data: {
          password: password,
          confirm_text: confirmText.trim()
        }
      });
      
      logout();
      navigate('/auth', { state: { message: 'Your account and all associated data have been permanently deleted.' } });
    } catch (err) {
      console.error('Failed to delete account:', err);
      const detail = err.response?.data?.detail;
      setDeleteError(typeof detail === 'string' ? detail : detail?.message || 'Failed to delete account. Please verify your password.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="app-layout">
        <NavigationBar />
        <main className="main-content page-container">
          <div className="page-header-title">
            <h2 className="page-title">User Profile</h2>
            <p className="page-subtitle">Loading workspace identity and usage telemetry...</p>
          </div>
          <div className="profile-bento-grid">
            <div className="bento-card bento-identity skeleton" style={{ minHeight: 340 }} />
            <div className="bento-card bento-quotas skeleton" style={{ minHeight: 340 }} />
            <div className="bento-card bento-telemetry skeleton" style={{ minHeight: 220 }} />
            <div className="bento-card bento-activity skeleton" style={{ minHeight: 220 }} />
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-layout">
        <NavigationBar />
        <main className="main-content page-container">
          <div className="glass-panel error-card-box">
            <AlertTriangle className="icon-lg text-danger" />
            <h3>Failed to Load Profile</h3>
            <p>We encountered an issue connecting to your user profile session.</p>
            <button className="btn primary-btn mt-4" onClick={fetchData}>
              <RefreshCw className="icon-sm" />
              <span>Retry Connection</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  const docLimit = usage?.documents_limit || 10;
  const docsUsed = usage?.documents_used ?? profile.total_documents ?? 0;
  const docPct = Math.min(Math.round((docsUsed / docLimit) * 100), 100);

  const storageLimit = usage?.storage_limit_mb || 100;
  const storageUsed = usage?.storage_used_mb ?? profile.storage_used_mb ?? 0;
  const storagePct = Math.min(Math.round((storageUsed / storageLimit) * 100), 100);

  const queryLimit = usage?.queries_limit || 100;
  const queriesUsed = usage?.queries_used ?? profile.total_queries ?? 0;
  const queryPct = Math.min(Math.round((queriesUsed / queryLimit) * 100), 100);

  return (
    <div className="app-layout">
      <NavigationBar />

      <main className="main-content page-container">
        {/* Page Header */}
        <div className="page-header-title">
          <h1 className="page-title">User Profile & Identity</h1>
          <p className="page-subtitle">
            Manage your workspace identity, monitor tier quota capacity, and account telemetry.
          </p>
        </div>

        {/* Modern Bento Grid */}
        <div className="profile-bento-grid">
          {/* Bento 1: Identity & Persona (Span 5) */}
          <div className="bento-card bento-identity">
            <div className="identity-hero-top">
              <div 
                className="profile-avatar-container" 
                title="Click to change profile picture"
                onClick={() => !avatarUploading && avatarInputRef.current?.click()}
              >
                {avatarUploading ? (
                  <RefreshCw className="icon-md animate-spin" />
                ) : profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="profile-avatar-img" />
                ) : (
                  (profile.display_name || profile.email)?.[0]?.toUpperCase() || 'U'
                )}

                <div className="avatar-upload-overlay">
                  <Upload className="icon-xs" />
                  <span>{avatarUploading ? 'Uploading...' : 'Change'}</span>
                </div>
              </div>

              {/* Hidden file input for avatar upload */}
              <input 
                type="file" 
                ref={avatarInputRef} 
                onChange={handleAvatarChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />

              <div className="identity-meta-group">
                <span className="identity-role-pill">
                  {profile.role || 'Researcher'}
                </span>

                {isEditing ? (
                  <div className="profile-edit-box mt-2">
                    <input
                      type="text"
                      className="profile-input-field"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Display name"
                      maxLength={60}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                    <div className="profile-edit-btn-group">
                      <button 
                        type="button"
                        className="btn outline-btn btn-sm" 
                        onClick={() => {
                          setIsEditing(false);
                          setEditName(profile.display_name || '');
                        }} 
                        disabled={saving}
                      >
                        <X className="icon-xs" />
                      </button>
                      <button 
                        type="button"
                        className="btn primary-btn btn-sm" 
                        onClick={handleSave} 
                        disabled={saving}
                      >
                        {saving ? <RefreshCw className="icon-xs animate-spin" /> : <Check className="icon-xs" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="identity-name-row">
                    <h2>{profile.display_name || profile.username || 'Workspace User'}</h2>
                    <button 
                      type="button"
                      className="btn-icon text-btn" 
                      title="Edit Display Name"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit2 className="icon-sm" />
                    </button>
                  </div>
                )}

                {profile.username && (
                  <span className="identity-username-handle">@{profile.username}</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <button 
                type="button"
                className="identity-email-pill"
                onClick={() => copyToClipboard(profile.email, 'email')}
                title="Click to copy email address"
              >
                <Mail className="icon-xs" />
                <span>{profile.email}</span>
                {copiedEmail ? (
                  <Check className="icon-xs text-success" />
                ) : (
                  <Copy className="icon-xs" style={{ opacity: 0.5 }} />
                )}
              </button>
            </div>
          </div>

          {/* Bento 2: Tier & Quotas Visualizer (Span 7) */}
          <div className="bento-card bento-quotas">
            <div>
              <div className="bento-header">
                <div className="bento-header-left">
                  <div className="bento-icon-badge">
                    <Database className="icon" />
                  </div>
                  <h3 className="bento-title">Workspace Quotas & Limits</h3>
                </div>
                <span className="plan-badge-pill">
                  <Sparkles className="icon-xs" />
                  <span>{profile.plan || 'Free'} Tier</span>
                </span>
              </div>

              {/* Progress Bars */}
              <div className="quotas-stack">
                {/* 1. Documents */}
                <div className="quota-item">
                  <div className="quota-label-row">
                    <span className="quota-type">
                      <FileText className="icon-sm text-accent" />
                      <span>Indexed Documents</span>
                    </span>
                    <span className="quota-fraction">
                      <strong>{docsUsed}</strong> / {docLimit >= 999999 ? '∞' : docLimit} docs ({docPct}%)
                    </span>
                  </div>
                  <div className="quota-bar-track">
                    <div 
                      className="quota-bar-fill fill-sunset" 
                      style={{ width: `${Math.max(docPct, 2)}%` }} 
                    />
                  </div>
                </div>

                {/* 2. Vector Storage */}
                <div className="quota-item">
                  <div className="quota-label-row">
                    <span className="quota-type">
                      <Database className="icon-sm" style={{ color: '#06b6d4' }} />
                      <span>Vector Embeddings Storage</span>
                    </span>
                    <span className="quota-fraction">
                      <strong>{storageUsed} MB</strong> / {storageLimit >= 999999 ? '∞' : `${storageLimit} MB`} ({storagePct}%)
                    </span>
                  </div>
                  <div className="quota-bar-track">
                    <div 
                      className="quota-bar-fill fill-cyan" 
                      style={{ width: `${Math.max(storagePct, 2)}%` }} 
                    />
                  </div>
                </div>

                {/* 3. Query Limit */}
                <div className="quota-item">
                  <div className="quota-label-row">
                    <span className="quota-type">
                      <Search className="icon-sm" style={{ color: '#10b981' }} />
                      <span>Monthly Research Queries</span>
                    </span>
                    <span className="quota-fraction">
                      <strong>{queriesUsed}</strong> / {queryLimit >= 999999 ? '∞' : queryLimit} ({queryPct}%)
                    </span>
                  </div>
                  <div className="quota-bar-track">
                    <div 
                      className="quota-bar-fill fill-green" 
                      style={{ width: `${Math.max(queryPct, 2)}%` }} 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quota Perks Callout */}
            <div className="quota-perks-box">
              <div className="quota-perks-text">
                <Sparkles className="icon-sm text-accent" />
                <span>
                  Upgrade to <strong>Pro</strong> for 100 docs, 5GB storage, and Gemini 1.5 Pro synthesis.
                </span>
              </div>
              <Link to="/settings" className="btn outline-btn btn-sm" style={{ whiteSpace: 'nowrap' }}>
                <span>View Plans</span>
              </Link>
            </div>
          </div>

          {/* Bento 3: Account Telemetry (Span 5) */}
          <div className="bento-card bento-telemetry">
            <div className="bento-header">
              <div className="bento-header-left">
                <div className="bento-icon-badge" style={{ backgroundColor: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4', borderColor: 'rgba(6, 182, 212, 0.25)' }}>
                  <Shield className="icon" />
                </div>
                <h3 className="bento-title">Account Telemetry</h3>
              </div>
            </div>

            <div className="telemetry-list">
              <div className="telemetry-row">
                <span className="telemetry-label">
                  <User className="icon-xs" />
                  <span>Unique User ID</span>
                </span>
                <button 
                  type="button" 
                  className={`copy-uuid-btn ${copiedUuid ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(profile.id, 'uuid')}
                  title="Click to copy User ID"
                >
                  <span>{profile.id ? `${profile.id.slice(0, 8)}...${profile.id.slice(-4)}` : 'N/A'}</span>
                  {copiedUuid ? <Check className="icon-xs text-success" /> : <Copy className="icon-xs" />}
                </button>
              </div>

              <div className="telemetry-row">
                <span className="telemetry-label">
                  <Shield className="icon-xs" />
                  <span>Session Status</span>
                </span>
                <span className="session-pulse-badge">
                  <div className="pulse-circle" />
                  <span>{profile.last_login ? 'Active Session' : 'Active Session'}</span>
                </span>
              </div>

              <div className="telemetry-row">
                <span className="telemetry-label">
                  <Calendar className="icon-xs" />
                  <span>Member Since</span>
                </span>
                <span className="telemetry-value">
                  {new Date(profile.created_at || Date.now()).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </span>
              </div>

              <div className="telemetry-row">
                <span className="telemetry-label">
                  <Zap className="icon-xs" />
                  <span>Inference Engine</span>
                </span>
                <span className="telemetry-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-accent-sunset)' }}>
                  Gemini 1.5 Flash
                </span>
              </div>
            </div>
          </div>

          {/* Bento 4: Recent Workspace Activity (Span 7) */}
          <div className="bento-card bento-activity">
            <div className="bento-header">
              <div className="bento-header-left">
                <div className="bento-icon-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
                  <FileText className="icon" />
                </div>
                <h3 className="bento-title">Recent Indexed Documents</h3>
              </div>
              <Link to="/library" className="btn text-btn btn-sm" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>All Documents</span>
                <ChevronRight className="icon-xs" />
              </Link>
            </div>

            {recentDocs && recentDocs.length > 0 ? (
              <div className="activity-list">
                {recentDocs.map((doc) => (
                  <Link 
                    key={doc.id} 
                    to="/library" 
                    className="activity-item"
                    title={`Open ${doc.filename}`}
                  >
                    <div className="activity-left">
                      <div className="activity-file-icon">
                        <FileText className="icon-xs" />
                      </div>
                      <span className="activity-file-name">{doc.filename}</span>
                    </div>
                    <div className="activity-right">
                      <span>{formatFileSize(doc.size_bytes)}</span>
                      <span>•</span>
                      <span>
                        {new Date(doc.uploaded_at || Date.now()).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric'
                        })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="activity-empty-box">
                <Search className="icon-lg" style={{ opacity: 0.3 }} />
                <span>No documents indexed yet in your workspace</span>
                <Link to="/" className="btn outline-btn btn-sm mt-2">
                  <span>Drop Document in Query Hub</span>
                </Link>
              </div>
            )}
          </div>

          {/* Bento 5: Collapsible Danger Zone Accordion (Span 12) */}
          <div className="bento-danger-accordion">
            <button 
              type="button" 
              className="danger-accordion-toggle"
              onClick={() => setIsDangerOpen(!isDangerOpen)}
              aria-expanded={isDangerOpen}
            >
              <div className="danger-toggle-left">
                <AlertTriangle className="icon-sm text-danger" />
                <h3>Danger Zone</h3>
                <span className="danger-toggle-subtitle">Account Deletion & Vector Data Purge</span>
              </div>
              <ChevronDown 
                className="icon-sm text-danger" 
                style={{ 
                  transform: isDangerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease'
                }} 
              />
            </button>

            {isDangerOpen && (
              <div className="danger-accordion-content">
                <p className="danger-content-text">
                  Permanently remove your account, clear vector embeddings, and purge all indexed documents and chat histories from Lexis object storage. This action is irreversible.
                </p>
                <button 
                  type="button"
                  className="danger-btn-bento"
                  onClick={() => {
                    setShowDeleteModal(true);
                    setPassword('');
                    setConfirmText('');
                    setDeleteError('');
                  }}
                >
                  <Trash2 className="icon-xs" />
                  <span>Delete Account & Purge Data</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Floating Toast Notification */}
        {saveStatus && (
          <div className={`settings-toast toast-${saveStatus.type} glass-panel`}>
            {saveStatus.type === 'success' ? <Check className="icon text-success" /> : <AlertTriangle className="icon text-danger" />}
            <span>{saveStatus.message}</span>
          </div>
        )}
      </main>

      {/* Delete Account High-Severity Confirmation Modal */}
      {showDeleteModal && (
        <div 
          className="modal-backdrop"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div 
            className="modal-card modal-card-danger glass-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertTriangle className="icon-lg text-danger" />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>PERMANENT ACCOUNT DELETION</h3>
                  <p className="info-key" style={{ fontSize: '12px', color: '#fca5a5' }}>This action is irreversible and permanent.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => !deleting && setShowDeleteModal(false)}
                className="btn-icon text-btn"
                disabled={deleting}
                style={{ marginLeft: 'auto' }}
              >
                <X className="icon-sm" />
              </button>
            </div>

            <div className="glass-panel" style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#fca5a5', marginBottom: '6px' }}>
                The following resources will be permanently purged:
              </p>
              <ul style={{ paddingLeft: '18px', fontSize: '12px', color: 'var(--color-body)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>All uploaded PDF/DOCX files from Tigris/S3 object storage</li>
                <li>All vector embeddings & local search indices</li>
                <li>All chat sessions, message histories, and inline citations</li>
                <li>Your profile credentials, avatar, and settings preferences</li>
              </ul>
            </div>

            {deleteError && (
              <div className="auth-error-banner" role="alert">
                <AlertTriangle className="icon-sm text-danger" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmDelete} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Password Input */}
              <div className="auth-input-group">
                <label className="auth-field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock className="icon-xs" />
                  <span>ENTER PASSWORD TO CONFIRM</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your account password"
                  required
                  disabled={deleting}
                  className="auth-text-input"
                />
              </div>

              {/* Confirmation Text Input */}
              <div className="auth-input-group">
                <label className="auth-field-label">
                  TYPE <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>DELETE MY ACCOUNT</span> BELOW
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  required
                  disabled={deleting}
                  className="auth-text-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="btn outline-btn"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={deleting || !password || confirmText.trim() !== 'DELETE MY ACCOUNT'}
                  className="btn danger-btn"
                  style={{ flex: 2 }}
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="icon-xs animate-spin" />
                      <span>Purging Account & Data...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="icon-xs" />
                      <span>Permanently Delete Everything</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
