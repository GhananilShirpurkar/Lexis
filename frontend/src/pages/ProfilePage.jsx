import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  User, Mail, Calendar, Shield, Edit2, Check, X, 
  Trash2, AlertTriangle, RefreshCw, Sparkles, FileText, Search, Database, Lock
} from '../components/icons';
import apiClient from '../api/client';
import NavigationBar from '../components/NavigationBar';

const ProfilePage = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Delete Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await apiClient.get('/users/me');
      setProfile(res.data);
      setEditName(res.data.display_name || '');
    } catch (err) {
      console.error('Failed to load profile:', err);
      setSaveStatus({ type: 'error', message: 'Failed to load profile' });
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
      setSaveStatus({ type: 'success', message: 'Profile updated' });
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
            <p className="page-subtitle">Manage workspace identity, view activity stats, and account settings.</p>
          </div>
          <div className="profile-layout-grid">
            <div className="glass-panel profile-hero-card skeleton" style={{ height: 320 }} />
            <div className="glass-panel profile-details-card skeleton" style={{ height: 320 }} />
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
            <button className="btn primary-btn mt-4" onClick={fetchProfile}>
              <RefreshCw className="icon-sm" />
              <span>Retry Connection</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <NavigationBar />

      <main className="main-content page-container">
        {/* Page Header */}
        <div className="page-header-title">
          <h1 className="page-title">User Profile & Identity</h1>
          <p className="page-subtitle">
            Manage your display identity, view document usage metrics, and security settings.
          </p>
        </div>

        {/* Profile Grid */}
        <div className="profile-layout-grid">
          {/* Left Column: Avatar & Quick Metrics */}
          <div className="glass-panel profile-hero-card">
            <div className="avatar-wrapper">
              <div className="avatar-circle-lg overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  (profile.display_name || profile.email)?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <span className="user-role-badge">{profile.role || 'Workspace Member'}</span>
            </div>

            {isEditing ? (
              <div className="profile-edit-box">
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
              <div className="profile-name-row">
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

            <div className="profile-email-badge">
              <Mail className="icon-xs" />
              <span>{profile.email}</span>
            </div>

            {/* Quick Metrics */}
            <div className="profile-metrics-grid">
              <div className="metric-box">
                <Search className="icon metric-icon text-accent" />
                <span className="metric-num">{profile.total_queries ?? 0}</span>
                <span className="metric-lbl">Total Queries</span>
              </div>

              <div className="metric-box">
                <FileText className="icon metric-icon text-accent" />
                <span className="metric-num">{profile.total_documents ?? 0}</span>
                <span className="metric-lbl">Indexed Docs</span>
              </div>

              <div className="metric-box">
                <Database className="icon metric-icon text-accent" />
                <span className="metric-num">{profile.storage_used_mb ?? 0} MB</span>
                <span className="metric-lbl">Vector Storage</span>
              </div>
            </div>
          </div>

          {/* Right Column: Account Meta & Danger Zone */}
          <div className="profile-details-stack">
            {/* Account Details Card */}
            <div className="glass-panel profile-info-card">
              <div className="card-header-bar">
                <Shield className="icon text-accent" />
                <h3>Account Meta & Session</h3>
              </div>

              <div className="info-rows-list">
                <div className="info-row">
                  <span className="info-key">Member Since</span>
                  <span className="info-val">
                    <Calendar className="icon-xs" />
                    {new Date(profile.created_at || Date.now()).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric'
                    })}
                  </span>
                </div>

                <div className="info-row">
                  <span className="info-key">Last Login</span>
                  <span className="info-val">
                    {profile.last_login 
                      ? new Date(profile.last_login).toLocaleString()
                      : 'Active Session'
                    }
                  </span>
                </div>

                <div className="info-row">
                  <span className="info-key">Current Tier Plan</span>
                  <span className={`plan-pill plan-${(profile.plan || 'free').toLowerCase()}`}>
                    {profile.plan || 'Free'}
                  </span>
                </div>

                <div className="info-row">
                  <span className="info-key">Unique User ID</span>
                  <span className="info-val mono-text">{profile.id}</span>
                </div>
              </div>
            </div>

            {/* Danger Zone Card */}
            <div className="glass-panel danger-zone-card">
              <div className="card-header-bar text-danger">
                <AlertTriangle className="icon" />
                <h3>Danger Zone</h3>
              </div>
              <p className="danger-zone-desc">
                Permanently remove your account, clear vector indexes, and purge all uploaded document files from Lexis.
              </p>
              <button 
                type="button"
                className="btn danger-btn" 
                onClick={() => {
                  setShowDeleteModal(true);
                  setPassword('');
                  setConfirmText('');
                  setDeleteError('');
                }}
              >
                <Trash2 className="icon-sm" />
                <span>Delete Account & Purge Data</span>
              </button>
            </div>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', gap: 12 }}>
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
