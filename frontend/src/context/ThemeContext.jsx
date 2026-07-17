import React, { createContext, useState, useEffect, useContext } from 'react';
import apiClient from '../api/client';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('lexis-theme') || 'system';
  });

  // Apply class to document element
  const applyTheme = (themeName) => {
    const isDark =
      themeName === 'dark' ||
      (themeName === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  };

  const setTheme = async (newTheme, syncToBackend = true) => {
    setThemeState(newTheme);
    localStorage.setItem('lexis-theme', newTheme);
    applyTheme(newTheme);

    // Persist to backend if requested and user has a token
    const token = localStorage.getItem('lexis_access_token');
    if (syncToBackend && token) {
      try {
        // First fetch current settings to prevent overwriting other fields
        const getRes = await apiClient.get('/users/me/settings');
        const currentSettings = getRes.data;
        await apiClient.patch('/users/me/settings', {
          ...currentSettings,
          theme: newTheme
        });
      } catch (err) {
        console.error('Failed to sync theme preference to backend:', err);
      }
    }
  };

  // Listen to system preference changes
  useEffect(() => {
    applyTheme(theme);

    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme('system');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Sync theme from backend on load/authentication
  useEffect(() => {
    const token = localStorage.getItem('lexis_access_token');
    if (!token) return;

    const fetchBackendTheme = async () => {
      try {
        const res = await apiClient.get('/users/me/settings');
        if (res.data && res.data.theme) {
          const backendTheme = res.data.theme;
          if (backendTheme !== theme) {
            setThemeState(backendTheme);
            localStorage.setItem('lexis-theme', backendTheme);
            applyTheme(backendTheme);
          }
        }
      } catch (err) {
        console.error('Failed to fetch backend theme settings:', err);
      }
    };

    fetchBackendTheme();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
