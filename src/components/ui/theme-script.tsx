const SCRIPT = `(function(){try{var t=localStorage.getItem('veda-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}})();`;

// Runs before first paint so a saved light theme never flashes dark.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
