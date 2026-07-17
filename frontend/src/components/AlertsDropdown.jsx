import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCircle, AlertTriangle, AlertCircle, Info, X } from './icons';

const AlertsDropdown = ({ notifications = [], onDismiss }) => {
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

  const unreadCount = notifications.length;

  return (
    <div className="alerts-dropdown-container" ref={dropdownRef}>
      <button 
        className="alerts-trigger-btn"
        onClick={() => setOpen(!open)}
      >
        <Bell className="icon" />
        <span>ALERTS</span>
        {unreadCount > 0 && (
          <span className="alerts-badge">{unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="alerts-dropdown-panel">
          <div className="alerts-dropdown-header">
            <span className="alerts-title">System Alerts</span>
            {notifications.length > 0 && (
              <span className="alerts-count-label">{notifications.length} ACTIVE</span>
            )}
          </div>

          <div className="alerts-list">
            {notifications.length === 0 ? (
              <div className="alerts-empty">
                <CheckCircle className="icon-large" />
                <span>All systems nominal</span>
              </div>
            ) : (
              notifications.map(n => {
                const type = n.type || 'warning';
                return (
                  <div 
                    key={n.id} 
                    className={`alert-item ${type} unread`}
                  >
                    <div className="alert-icon">
                      {type === 'warning' && <AlertTriangle className="icon" />}
                      {type === 'error' && <AlertCircle className="icon" />}
                      {type === 'success' && <CheckCircle className="icon" />}
                      {type === 'info' && <Info className="icon" />}
                    </div>
                    <div className="alert-content">
                      <span className="alert-message">{n.message}</span>
                      <span className="alert-time">{n.timeAgo || 'JUST NOW'}</span>
                    </div>
                    <button 
                      className="alert-dismiss"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(n.id, e);
                      }}
                      title="Dismiss Alert"
                    >
                      <X className="icon-small" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertsDropdown;
