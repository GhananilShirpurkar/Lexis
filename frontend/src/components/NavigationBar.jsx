import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { optimisticUpdate, shakeElement } from '../utils/optimistic';
import { BookOpen, Search, Library, Terminal, Settings as SettingsIcon } from './icons';
import ProfileDropdown from './ProfileDropdown';
import AlertsDropdown from './AlertsDropdown';
import ModelSelector from './ModelSelector';
import apiClient from '../api/client';

const NavigationBar = ({ currentModel, onModelChange, customNotifications, onCustomDismiss }) => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [model, setModel] = useState(currentModel || 'gemini-1.5-flash');
  const alertsRef = useRef(null);

  useEffect(() => {
    if (!customNotifications) {
      fetchNotifications();
    }
  }, [customNotifications]);

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/notifications');
      setNotifications((res.data || []).filter(n => !n.is_read));
    } catch (err) {
      console.log('Failed to fetch notifications:', err);
    }
  };

  const activeNotifs = customNotifications || notifications;

  const handleDismissNotification = async (id, e) => {
    if (e) e.stopPropagation();
    if (onCustomDismiss) {
      onCustomDismiss(id, e);
      return;
    }

    const previousNotifications = [...notifications];

    await optimisticUpdate({
      optimisticFn: () => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      },
      apiCall: async () => {
        await apiClient.patch(`/notifications/${id}`, { is_read: true });
      },
      rollbackFn: () => {
        setNotifications(previousNotifications);
      },
      errorMessage: "⚠️ Couldn't dismiss alert. Restored.",
      targetRef: alertsRef,
      toast
    });
  };

  const handleModelChange = (val) => {
    setModel(val);
    if (onModelChange) {
      onModelChange(val);
    }
  };

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="nav-bar">
      <div className="nav-left">
        <Link to="/" className="logo-pill">
          <BookOpen className="icon" />
          <span className="logo-wordmark">LEXIS</span>
        </Link>

        <div className="nav-divider" />

        <nav className="nav-links">
          <Link id="nav-query" to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
            <Search className="icon" />
            <span>Query</span>
          </Link>
          <Link id="nav-library" to="/library" className={`nav-item ${isActive('/library') ? 'active' : ''}`}>
            <Library className="icon" />
            <span>Library</span>
          </Link>
          <Link id="nav-console" to="/dev-console" className={`nav-item ${isActive('/dev-console') ? 'active' : ''}`}>
            <Terminal className="icon" />
            <span>Console</span>
          </Link>
          <Link id="nav-settings" to="/settings" className={`nav-item ${isActive('/settings') ? 'active' : ''}`}>
            <SettingsIcon className="icon" />
            <span>Settings</span>
          </Link>
        </nav>
      </div>

      <div className="nav-right">
        <div ref={alertsRef}>
          <AlertsDropdown 
            notifications={activeNotifs} 
            onDismiss={handleDismissNotification} 
          />
        </div>

        <div className="nav-divider" />

        <ModelSelector 
          currentModelValue={model} 
          onChange={handleModelChange} 
        />

        <div className="nav-divider" />

        <ProfileDropdown user={user} onLogout={logout} />
      </div>
    </header>
  );
};

export default NavigationBar;
