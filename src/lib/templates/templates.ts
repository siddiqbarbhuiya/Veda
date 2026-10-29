/** Project templates. A template is created in its own folder, so it never overwrites the student's files. */

export type TemplateRuntime = "node" | "python";

export type Template = {
  id: string;
  name: string;
  description: string;
  runtime: TemplateRuntime;
  /** Paths are relative to the template folder. */
  files: Record<string, string>;
  /** The file to open first. */
  entry: string;
  /** Commands that "Create and run" starts in the template folder. Empty for a plain script. */
  run: Array<{ cmd: string; args: string[] }>;
  /** True when the command in `run` starts a web server that the preview panel shows. */
  serves: boolean;
};

const nodeScript: Template = {
  id: "node-script",
  name: "Node script",
  description: "A plain JavaScript file. Press Run.",
  runtime: "node",
  entry: "index.js",
  run: [],
  serves: false,
  files: {
    "index.js": `const name = "Veda";\nconsole.log(\`Hello from \${name}!\`);\n`,
  },
};

const python: Template = {
  id: "python",
  name: "Python",
  description: "A Python script that runs in your browser. Press Run.",
  runtime: "python",
  entry: "main.py",
  run: [],
  serves: false,
  files: {
    "main.py": `def total(n):\n    return sum(range(1, n + 1))\n\n\nprint("Sum of 1 to 10:", total(10))\n`,
  },
};

const express: Template = {
  id: "express",
  name: "Express server",
  description: "A small web server. It shows in the Preview tab.",
  runtime: "node",
  entry: "index.js",
  run: [
    { cmd: "npm", args: ["install"] },
    { cmd: "npm", args: ["start"] },
  ],
  serves: true,
  files: {
    "package.json": JSON.stringify(
      {
        name: "express-app",
        version: "1.0.0",
        private: true,
        main: "index.js",
        scripts: { start: "node index.js" },
        dependencies: { express: "^4.21.2" },
      },
      null,
      2
    ) + "\n",
    "index.js": `const express = require("express");\n\nconst app = express();\nconst port = 3000;\n\napp.get("/", (req, res) => {\n  res.send("<h1>Hello from Express on Veda</h1>");\n});\n\napp.get("/api/time", (req, res) => {\n  res.json({ now: new Date().toISOString() });\n});\n\napp.listen(port, () => {\n  console.log(\`Server is ready on port \${port}\`);\n});\n`,
  },
};

const viteReact: Template = {
  id: "vite-react",
  name: "Vite + React",
  description: "A React app with hot reload. It shows in the Preview tab.",
  runtime: "node",
  entry: "src/App.jsx",
  run: [
    { cmd: "npm", args: ["install"] },
    { cmd: "npm", args: ["run", "dev"] },
  ],
  serves: true,
  files: {
    "package.json": JSON.stringify(
      {
        name: "vite-react-app",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^5.4.11" },
      },
      null,
      2
    ) + "\n",
    "vite.config.js": `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`,
    "index.html": `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite + React</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
    "src/main.jsx": `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
    "src/App.jsx": `import { useState } from "react";\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <main>\n      <h1>Hello from React on Veda</h1>\n      <button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</button>\n    </main>\n  );\n}\n`,
    "src/index.css": `body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}\n\nbutton {\n  font-size: 1rem;\n  padding: 0.5rem 1rem;\n}\n`,
  },
};

export const TEMPLATES: Template[] = [python, nodeScript, viteReact, express];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** A folder name that no sibling uses: `base`, then `base-2`, `base-3`, and so on. Names compare without case. */
export function uniqueFolder(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const name = `${base}-${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** The files of a template under `folder`, as `[path, content]` pairs with folder keys (ending in "/") first. */
export function templateEntries(template: Template, folder: string): Array<[string, string]> {
  const out: Array<[string, string]> = [[`${folder}/`, ""]];
  const dirs = new Set<string>();
  for (const rel of Object.keys(template.files)) {
    const parts = rel.split("/").slice(0, -1);
    let acc = folder;
    for (const p of parts) {
      acc = `${acc}/${p}`;
      dirs.add(`${acc}/`);
    }
  }
  for (const d of [...dirs].sort((a, b) => a.split("/").length - b.split("/").length)) out.push([d, ""]);
  for (const [rel, content] of Object.entries(template.files)) out.push([`${folder}/${rel}`, content]);
  return out;
}
