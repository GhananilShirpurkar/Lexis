
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { optimisticUpdate, shakeElement } from '../utils/optimistic';
import { Search, Library, Settings as SettingsIcon, Menu, X, LexisLogo } from './icons';
import ProfileDropdown from './ProfileDropdown';
import AlertsDropdown from './AlertsDropdown';
import ModelSelector from './ModelSelector';
import apiClient from '../api/client';

const NavigationBar = ({ 
  currentModel, 
  onModelChange, 
  customNotifications, 
  onCustomDismiss,
  sidebarOpen,
  onToggleSidebar
}) => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [model, setModel] = useState(currentModel || 'gemini-1.5-flash');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const alertsRef = useRef(null);

  useEffect(() => {
    if (!customNotifications) {
      fetchNotifications();
    }
  }, [customNotifications]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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
        {onToggleSidebar && (
          <button
            type="button"
            className="btn-ghost md:hidden mr-2 p-1.5 focus:outline-none"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Close sidebar menu" : "Open sidebar menu"}
          >
            <Menu className="icon" />
          </button>
        )}
        <Link to="/" className="logo-pill">
          <LexisLogo size={16} />
          <span className="logo-wordmark">LEXIS</span>
        </Link>

        <div className="nav-divider nav-divider-mobile-hide" />

        {/* Desktop Navigation Links */}
        <nav className="nav-links nav-links-desktop">
          <Link id="nav-query" to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
            <Search className="icon" />
            <span>Query</span>
          </Link>
          <Link id="nav-library" to="/library" className={`nav-item ${isActive('/library') ? 'active' : ''}`}>
            <Library className="icon" />
            <span>Library</span>
          </Link>
          <Link id="nav-settings" to="/settings" className={`nav-item ${isActive('/settings') ? 'active' : ''}`}>
            <SettingsIcon className="icon" />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Mobile Navigation Toggle Button */}
        <button
          type="button"
          className="btn-ghost md:hidden p-1.5 focus:outline-none ml-1"
          onClick={() => setMobileNavOpen(prev => !prev)}
          aria-label={mobileNavOpen ? "Close main navigation menu" : "Open main navigation menu"}
        >
          {mobileNavOpen ? <X className="icon" /> : <Menu className="icon" />}
        </button>
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

      {/* Mobile Navigation Dropdown */}
      {mobileNavOpen && (
        <nav className="nav-links-mobile md:hidden">
          <Link 
            id="mobile-nav-query" 
            to="/" 
            className={`nav-item ${isActive('/') ? 'active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <Search className="icon" />
            <span>Query</span>
          </Link>
          <Link 
            id="mobile-nav-library" 
            to="/library" 
            className={`nav-item ${isActive('/library') ? 'active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <Library className="icon" />
            <span>Library</span>
          </Link>
          <Link 
            id="mobile-nav-settings" 
            to="/settings" 
            className={`nav-item ${isActive('/settings') ? 'active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <SettingsIcon className="icon" />
            <span>Settings</span>
          </Link>
        </nav>
      )}
    </header>
  );
};

export default NavigationBar;
