import { createContext, useContext } from "react";

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
}

// Always light mode — dark mode toggle removed per design decision
const ThemeContext = createContext<ThemeCtx>({ isDark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Ensure .dark is never applied
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("dark");
  }
  return (
    <ThemeContext.Provider value={{ isDark: false, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
