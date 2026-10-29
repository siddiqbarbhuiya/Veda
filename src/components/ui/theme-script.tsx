// Runs before first paint so a saved light theme never flashes dark.
// Order: saved choice, then OS light preference, then the dark default (also when the OS has no preference).
const SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('veda-theme');if(t==='light'||t==='dark'){d.dataset.theme=t;return}}catch(e){}try{d.dataset.theme=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){d.dataset.theme='dark'}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
