import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="skeleton-container" style={{ padding: '2rem' }}>
        <div className="skeleton skeleton-header" style={{ height: '32px', marginBottom: '1.5rem', width: '200px' }}></div>
        <div className="skeleton skeleton-paragraph" style={{ height: '100px', marginBottom: '1.5rem' }}></div>
        <div className="skeleton skeleton-button" style={{ height: '44px', width: '120px' }}></div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login page but save the current location they were trying to go to
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
