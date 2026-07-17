import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Search, Library, Terminal, Settings as SettingsIcon } from './icons';
import ProfileDropdown from './ProfileDropdown';
import AlertsDropdown from './AlertsDropdown';
import ModelSelector from './ModelSelector';
import apiClient from '../api/client';

const NavigationBar = ({ currentModel, onModelChange }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [model, setModel] = useState(currentModel || 'gemini-1.5-flash');

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/notifications');
      setNotifications(res.data || []);
    } catch (err) {
      console.log('Failed to fetch notifications:', err);
    }
  };

  const handleDismissNotification = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await apiClient.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
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
          <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
            <Search className="icon" />
            <span>Query</span>
          </Link>
          <Link to="/library" className={`nav-item ${isActive('/library') ? 'active' : ''}`}>
            <Library className="icon" />
            <span>Library</span>
          </Link>
          <Link to="/dev-console" className={`nav-item ${isActive('/dev-console') ? 'active' : ''}`}>
            <Terminal className="icon" />
            <span>Console</span>
          </Link>
          <Link to="/settings" className={`nav-item ${isActive('/settings') ? 'active' : ''}`}>
            <SettingsIcon className="icon" />
            <span>Settings</span>
          </Link>
        </nav>
      </div>

      <div className="nav-right">
        <AlertsDropdown 
          notifications={notifications} 
          onDismiss={handleDismissNotification} 
        />

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
