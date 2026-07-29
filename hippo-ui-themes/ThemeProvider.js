'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme, defaultThemeId, getTheme, themes } from "./theme";

const ThemeContext = createContext(null);
const STORAGE_KEY = "hippo-build-theme";

export function ThemeProvider({ children, defaultTheme = defaultThemeId }) {
  const [themeId, setThemeIdState] = useState(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial = themes[saved] ? saved : defaultTheme;
    setThemeIdState(initial);
    applyTheme(initial);
    setMounted(true);
  }, [defaultTheme]);

  const setTheme = useCallback((nextThemeId) => {
    const safe = themes[nextThemeId] ? nextThemeId : defaultThemeId;
    setThemeIdState(safe);
    applyTheme(safe);
    window.localStorage.setItem(STORAGE_KEY, safe);
  }, []);

  const value = useMemo(() => ({ mounted, themeId, theme: getTheme(themeId), themes, setTheme }), [mounted, themeId, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
