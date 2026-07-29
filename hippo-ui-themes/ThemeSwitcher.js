'use client';

import { useTheme } from "./ThemeProvider";

export default function ThemeSwitcher() {
  const { mounted, themeId, themes, setTheme } = useTheme();
  if (!mounted) return null;

  return (
    <label className="grid gap-1 text-sm">
      <span style={{ color: "var(--ui-text-muted)" }}>Interface theme</span>
      <select
        value={themeId}
        onChange={(event) => setTheme(event.target.value)}
        className="rounded-xl border px-3 py-2"
        style={{
          color: "var(--ui-text)",
          background: "var(--ui-surface)",
          borderColor: "var(--ui-border)"
        }}
      >
        {Object.values(themes).map((theme) => (
          <option key={theme.id} value={theme.id}>{theme.name}</option>
        ))}
      </select>
    </label>
  );
}
