"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it brings its own <html>, theme script and colors.
// Hex values are inlined on purpose: globals.css may not be loaded in this state.
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('veda-theme');if(t==='light'||t==='dark'){d.dataset.theme=t;return}}catch(e){}try{d.dataset.theme=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){d.dataset.theme='dark'}})();`;

const STYLES = `
:root{color-scheme:dark;--bg:#0b0d12;--fg:#e6e9f0;--fg2:#a3acbd;--accent:#5b5fef;--accent-fg:#fff;--ring:#a5b4fc;--line:#66718a}
:root[data-theme=light]{color-scheme:light;--bg:#f6f7f9;--fg:#0f172a;--fg2:#475569;--accent:#4f46e5;--ring:#4f46e5;--line:#7b8599}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}
main{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:64px 16px;text-align:center}
h1{margin:0;font-size:32px;line-height:1.2}
p{margin:0;max-width:28rem;color:var(--fg2)}
.row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 24px;border-radius:6px;font:inherit;font-weight:500;text-decoration:none;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--fg)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.btn:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
`;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global app error", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Veda</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>The app could not load. Your saved files are safe. Try again.</p>
          {error.digest ? <p>Error code: {error.digest}</p> : null}
          <div className="row">
            <button type="button" className="btn primary" onClick={reset}>
              Try again
            </button>
            {/* A plain anchor on purpose: the router may be broken in this state. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn" href="/">
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
