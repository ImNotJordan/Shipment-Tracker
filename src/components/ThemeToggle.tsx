"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";
const KEY = "live-board-theme";

/** The theme the page is actually wearing, for anything that cannot be styled
 *  in CSS — Google's map tiles are painted from a styles array, not a
 *  stylesheet, so they have to be told.
 *
 *  The attribute on <html> is the one source of truth: the inline script in the
 *  layout sets it before paint and the toggle rewrites it. Watching it means a
 *  reader is right however the theme was set, including on first load. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // The inline script in the layout has already set this before paint; read it
  // back rather than guessing, so the icon never contradicts the page.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice just will not survive a reload.
    }
    setTheme(next);
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    // Reach the furthest corner so the wipe always clears the viewport.
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof doc.startViewTransition !== "function") {
      apply(next);
      return;
    }

    void doc.startViewTransition(() => apply(next)).ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 560,
          easing: "cubic-bezier(0.3, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onClick}
      aria-label={dark ? "Switch to day mode" : "Switch to night mode"}
      title={dark ? "Day mode" : "Night mode"}
    >
      {dark ? <Sun strokeWidth={1.8} aria-hidden /> : <Moon strokeWidth={1.8} aria-hidden />}
    </button>
  );
}
