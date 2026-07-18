import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, CreditCard, LogOut } from './icons';

const ProfileDropdown = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const menuItemsRef = useRef([]);

  // Reset menu item refs on each render
  menuItemsRef.current = [];
  const addToRefs = (el) => {
    if (el && !menuItemsRef.current.includes(el)) {
      menuItemsRef.current.push(el);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation inside open dropdown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;

      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        e.preventDefault();
      }

      if (e.key === 'ArrowDown') {
        const activeIndex = menuItemsRef.current.indexOf(document.activeElement);
        const nextIndex = (activeIndex + 1) % menuItemsRef.current.length;
        menuItemsRef.current[nextIndex]?.focus();
        e.preventDefault();
      }

      if (e.key === 'ArrowUp') {
        const activeIndex = menuItemsRef.current.indexOf(document.activeElement);
        const prevIndex = (activeIndex - 1 + menuItemsRef.current.length) % menuItemsRef.current.length;
        menuItemsRef.current[prevIndex]?.focus();
        e.preventDefault();
      }

      if (e.key === 'Tab') {
        const activeIndex = menuItemsRef.current.indexOf(document.activeElement);
        if (e.shiftKey) {
          // Wrap Shift+Tab focus to the last element if on the first
          if (activeIndex === 0) {
            menuItemsRef.current[menuItemsRef.current.length - 1]?.focus();
            e.preventDefault();
          }
        } else {
          // Wrap Tab focus to the first element if on the last
          if (activeIndex === menuItemsRef.current.length - 1) {
            menuItemsRef.current[0]?.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus the first menu item when dropdown opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        menuItemsRef.current[0]?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleNavigate = (path) => {
    navigate(path);
    setOpen(false);
  };

  const userEmail = user?.email || 'user@lexis.internal';
  const initial = userEmail[0].toUpperCase();

  return (
    <div className="profile-dropdown-container" ref={dropdownRef}>
      <button 
        ref={triggerRef}
        className="profile-avatar-btn"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account Menu"
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
        <div 
          className="profile-dropdown-panel"
          role="menu"
          aria-label="User account actions"
        >
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

          <button 
            ref={addToRefs}
            role="menuitem"
            className="profile-dropdown-item" 
            onClick={() => handleNavigate('/profile')}
          >
            <User className="icon" />
            <span>Profile</span>
          </button>

          <button 
            ref={addToRefs}
            role="menuitem"
            className="profile-dropdown-item" 
            onClick={() => handleNavigate('/settings')}
          >
            <Settings className="icon" />
            <span>Settings</span>
          </button>

          <button 
            ref={addToRefs}
            role="menuitem"
            className="profile-dropdown-item" 
            onClick={() => handleNavigate('/billing')}
          >
            <CreditCard className="icon" />
            <span>Billing</span>
          </button>

          <div className="profile-dropdown-divider" />

          <button 
            ref={addToRefs}
            role="menuitem"
            className="profile-dropdown-item danger" 
            onClick={() => { setOpen(false); onLogout(); }}
          >
            <LogOut className="icon" />
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;
