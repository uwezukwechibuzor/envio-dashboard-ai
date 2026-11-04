'use client';
import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setDark(false);
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setDark(true);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card))] transition-colors"
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}
