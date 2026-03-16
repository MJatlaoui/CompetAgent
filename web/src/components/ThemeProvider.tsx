"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "default" | "tactical";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: "default", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("default");

  useEffect(() => {
    const saved = localStorage.getItem("ca-theme") as Theme | null;
    if (saved === "tactical") {
      setThemeState("tactical");
      document.documentElement.classList.add("tactical");
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("ca-theme", t);
    if (t === "tactical") {
      document.documentElement.classList.add("tactical");
    } else {
      document.documentElement.classList.remove("tactical");
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
