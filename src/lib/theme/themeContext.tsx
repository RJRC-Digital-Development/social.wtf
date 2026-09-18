'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'night' | 'day';

interface ThemeContextType {
  theme: ThemeMode;
  isNight: boolean;
  isDay: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'social_wtf_theme_preference';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('night');
  const [mounted, setMounted] = useState(false);

  const applyTheme = (mode: ThemeMode) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (mode === 'night') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'night');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'day');
    }
  };

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (savedTheme === 'night' || savedTheme === 'day') {
        setThemeState(savedTheme);
        applyTheme(savedTheme);
      } else {
        setThemeState('night');
        applyTheme('night');
      }
    } catch (e) {
      applyTheme('night');
    }
    setMounted(true);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    applyTheme(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      // ignore storage error
    }
  };

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'night' ? 'day' : 'night';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isNight: theme === 'night',
        isDay: theme === 'day',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'night',
      isNight: true,
      isDay: false,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
};
