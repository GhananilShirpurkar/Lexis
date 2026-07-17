import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, CreditCard, LogOut } from './icons';

const ProfileDropdown = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavigate = (path) => {
    navigate(path);
    setOpen(false);
  };

  const userEmail = user?.email || 'user@lexis.internal';
  const initial = userEmail[0].toUpperCase();

  return (
    <div className="profile-dropdown-container" ref={dropdownRef}>
      <button 
        className="profile-avatar-btn"
        onClick={() => setOpen(!open)}
        title="Account Menu"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="User Avatar" className="profile-avatar-img" />
        ) : (
          <div className="profile-avatar-fallback">
            {initial}
          </div>
        )}
      </button>

      {open && (
        <div className="profile-dropdown-panel">
          <div className="profile-dropdown-header">
            <div className="profile-avatar-large">
              {user?.avatar ? (
                <img src={user.avatar} alt="User Avatar" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="profile-info">
              <span className="profile-email">{userEmail}</span>
              <span className="profile-role">Workspace User</span>
            </div>
          </div>

          <div className="profile-dropdown-divider" />

          <button className="profile-dropdown-item" onClick={() => handleNavigate('/profile')}>
            <User className="icon" />
            <span>Profile</span>
          </button>

          <button className="profile-dropdown-item" onClick={() => handleNavigate('/settings')}>
            <Settings className="icon" />
            <span>Settings</span>
          </button>

          <button className="profile-dropdown-item" onClick={() => handleNavigate('/billing')}>
            <CreditCard className="icon" />
            <span>Billing</span>
          </button>

          <div className="profile-dropdown-divider" />

          <button className="profile-dropdown-item danger" onClick={() => { setOpen(false); onLogout(); }}>
            <LogOut className="icon" />
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;
