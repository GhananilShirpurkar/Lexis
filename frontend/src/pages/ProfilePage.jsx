import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  User, Mail, Calendar, Shield, Edit2, Check, X, 
  Trash2, AlertTriangle, RefreshCw 
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

  const handleDelete = async () => {
    if (!window.confirm('PERMANENTLY delete your account and ALL data? This cannot be undone.')) {
      return;
    }
    setDeleting(true);
    try {
      await apiClient.delete('/users/me');
      logout();
      navigate('/auth');
    } catch (err) {
      setSaveStatus({ type: 'error', message: 'Failed to delete account' });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="app-shell">
        <NavigationBar />
        <div className="page-shell">
          <div className="page-header-bar">
            <User className="icon" />
            <h1>PROFILE</h1>
          </div>
          <div className="profile-layout">
            <div className="profile-card avatar-card" style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw className="icon-large spin" />
              <span className="loading-text" style={{ marginTop: 12 }}>Loading profile...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-shell">
        <NavigationBar />
        <div className="page-shell">
          <div className="page-header-bar">
            <User className="icon" />
            <h1>PROFILE</h1>
          </div>
          <div className="profile-card error-state">
            <AlertTriangle className="icon-large" />
            <p>Failed to load profile. <button onClick={fetchProfile}>Retry</button></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <NavigationBar />
      <div className="page-shell">
        <div className="page-header-bar">
          <User className="icon" />
          <h1>PROFILE</h1>
        </div>

        <div className="profile-layout">
          {/* Left: Avatar & Quick Stats */}
          <div className="profile-card avatar-card">
            <div className="profile-avatar-xl">
              {(profile.display_name || profile.email)?.[0]?.toUpperCase()}
            </div>
            
            {isEditing ? (
              <div className="profile-edit-name">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Display name"
                  maxLength={60}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <div className="profile-edit-actions">
                  <button className="btn-ghost" onClick={() => {
                    setIsEditing(false);
                    setEditName(profile.display_name || '');
                  }} disabled={saving}>
                    <X className="icon-small" />
                  </button>
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="icon-small spin" /> : <Check className="icon-small" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="profile-name-row">
                <h2>{profile.display_name || 'Workspace User'}</h2>
                <button className="btn-ghost" onClick={() => setIsEditing(true)}>
                  <Edit2 className="icon-small" />
                </button>
              </div>
            )}

            <span className="profile-email-display">
              <Mail className="icon-small" />
              {profile.email}
            </span>

            <div className="profile-stats-grid">
              <div className="profile-stat">
                <span className="stat-value">{profile.total_queries}</span>
                <span className="stat-label">Queries</span>
              </div>
              <div className="profile-stat">
                <span className="stat-value">{profile.total_documents}</span>
                <span className="stat-label">Documents</span>
              </div>
              <div className="profile-stat">
                <span className="stat-value">{profile.storage_used_mb} MB</span>
                <span className="stat-label">Storage</span>
              </div>
            </div>
          </div>

          {/* Right: Details & Danger Zone */}
          <div className="profile-details-stack">
            <div className="profile-card">
              <div className="profile-section-header">
                <Shield className="icon" />
                <h3>Account Information</h3>
              </div>
              
              <div className="profile-detail-row">
                <span className="detail-label">Member Since</span>
                <span className="detail-value">
                  <Calendar className="icon-small" />
                  {new Date(profile.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </span>
              </div>
              
              <div className="profile-detail-row">
                <span className="detail-label">Last Login</span>
                <span className="detail-value">
                  {profile.last_login 
                    ? new Date(profile.last_login).toLocaleString()
                    : '—'
                  }
                </span>
              </div>
              
              <div className="profile-detail-row">
                <span className="detail-label">Plan</span>
                <span className={`detail-value plan-badge plan-${(profile.plan || 'free').toLowerCase()}`}>
                  {profile.plan}
                </span>
              </div>
              
              <div className="profile-detail-row">
                <span className="detail-label">User ID</span>
                <span className="detail-value mono">{profile.id}</span>
              </div>
            </div>

            <div className="profile-card danger-zone">
              <div className="profile-section-header">
                <AlertTriangle className="icon" />
                <h3>Danger Zone</h3>
              </div>
              <p className="danger-text">
                Once deleted, your account and all associated data cannot be recovered.
              </p>
              <button 
                className="btn-danger" 
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <RefreshCw className="icon-small spin" /> : <Trash2 className="icon-small" />}
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>

        {/* Toast notifications */}
        {saveStatus && (
          <div className={`toast toast-${saveStatus.type}`}>
            {saveStatus.type === 'success' ? <Check className="icon-small" /> : <AlertTriangle className="icon-small" />}
            {saveStatus.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
