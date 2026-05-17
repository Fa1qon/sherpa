// src/renderer/providers/ThemeProvider.tsx
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { useSettings } from '../store/settings';

export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const theme = useSettings((s) => s.user.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-auto');
    root.classList.add(`theme-${theme}`);
  }, [theme]);

  return <>{children}</>;
}
