/**
 * Files of the "React + FastAPI" template.
 *
 * FastAPI runs in the browser: Pyodide (Python) lives in a Web Worker inside the preview page,
 * and a small fetch shim sends every `/api/...` call to the FastAPI app in that worker.
 * The JavaScript files below must not contain backticks or `${`, so String.raw can hold them as they are.
 */

// Keep this version equal to PYODIDE_VERSION in src/hooks/use-pyodide.ts.
const PYODIDE_VERSION = "314.0.7";

const packageJson =
  JSON.stringify(
    {
      name: "react-fastapi-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build" },
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^5.4.11" },
    },
    null,
    2
  ) + "\n";

const viteConfig = String.raw`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
});
`;

const indexHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React + FastAPI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

const mainJsx = String.raw`import React from "react";
import ReactDOM from "react-dom/client";
// This line makes fetch("/api/...") talk to the FastAPI app in backend/main.py.
import "./python/api.js";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const appJsx = String.raw`import { useEffect, useState } from "react";
import { backendReady } from "./python/api.js";

export default function App() {
  const [status, setStatus] = useState("Starting Python (the first start can take about 20 seconds)...");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch("/api/items");
    setItems(await res.json());
  }

  useEffect(() => {
    let live = true;
    backendReady
      .then(async () => {
        const hello = await (await fetch("/api/hello")).json();
        if (!live) return;
        setMessage(hello.message);
        setStatus("");
        await load();
      })
      .catch((err) => live && setStatus("The Python backend failed: " + err.message));
    return () => {
      live = false;
    };
  }, []);

  async function addItem(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    await load();
  }

  return (
    <main>
      <h1>React + FastAPI on Veda</h1>
      {status ? <p className="status">{status}</p> : <p className="ok">{message}</p>}
      <form onSubmit={addItem}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New item" />
        <button type="submit" disabled={Boolean(status)}>
          Add
        </button>
      </form>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <p className="hint">Edit backend/main.py and save. The Python backend reloads.</p>
    </main>
  );
}
`;

const indexCss = String.raw`body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
}

input,
button {
  font-size: 1rem;
  padding: 0.5rem 0.75rem;
}

.status {
  color: #b45309;
}

.ok {
  color: #15803d;
}

.hint {
  color: #6b7280;
  font-size: 0.875rem;
}
`;

// The main-thread side. It starts the worker and turns fetch("/api/...") into a message to the worker.
const apiJs = String.raw`// Connects fetch("/api/...") to the FastAPI app that runs in a Web Worker (see worker.js).
import mainPy from "../../backend/main.py?raw";
import requirementsTxt from "../../backend/requirements.txt?raw";

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map();
let nextId = 1;
let markReady;
let markFailed;

export const backendReady = new Promise((resolve, reject) => {
  markReady = resolve;
  markFailed = reject;
});

worker.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "ready") markReady();
  else if (msg.type === "error") markFailed(new Error(msg.message));
  else if (msg.type === "response") {
    const call = pending.get(msg.id);
    pending.delete(msg.id);
    if (call) call(msg);
  }
};

function loadBackend() {
  worker.postMessage({ type: "load", source: mainPy, requirements: requirementsTxt });
}
loadBackend();

// Save backend/main.py and the Python code loads again, without a page reload.
if (import.meta.hot) {
  import.meta.hot.accept(["../../backend/main.py?raw", "../../backend/requirements.txt?raw"], () => {
    window.location.reload();
  });
}

async function callBackend(request) {
  await backendReady;
  const body = await request.text();
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const url = new URL(request.url);
    worker.postMessage({
      type: "request",
      id,
      method: request.method,
      path: url.pathname,
      query: url.search.replace(/^\?/, ""),
      headers: [...request.headers.entries()],
      body,
    });
  });
}

const realFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
    return realFetch(input, init);
  }
  const reply = await callBackend(request);
  const nullBody = reply.status === 204 || reply.status === 304;
  return new Response(nullBody ? null : reply.body, { status: reply.status, headers: reply.headers });
};
`;

// The worker: it loads Pyodide, installs FastAPI, and runs each request through the ASGI app.
const workerJs = String.raw`// Runs Python (Pyodide) in a Web Worker and serves the FastAPI app of backend/main.py.
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v__PYODIDE_VERSION__/full/";

// Python helper: calls an ASGI app (FastAPI) once and returns the status, the headers and the body.
const ASGI_HELPER = [
  "async def handle(app, method, path, query, headers, body):",
  "    sent = []",
  "    state = {'done': False}",
  "    async def receive():",
  "        if not state['done']:",
  "            state['done'] = True",
  "            return {'type': 'http.request', 'body': body.encode(), 'more_body': False}",
  "        return {'type': 'http.disconnect'}",
  "    async def send(message):",
  "        sent.append(message)",
  "    scope = {",
  "        'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',",
  "        'method': method, 'scheme': 'http', 'path': path, 'raw_path': path.encode(),",
  "        'query_string': query.encode(), 'root_path': '',",
  "        'headers': [(k.lower().encode(), v.encode()) for k, v in headers],",
  "        'server': ('veda', 80), 'client': ('browser', 0),",
  "    }",
  "    await app(scope, receive, send)",
  "    status, out_headers, chunks = 500, [], []",
  "    for m in sent:",
  "        if m['type'] == 'http.response.start':",
  "            status = m['status']",
  "            out_headers = [[k.decode(), v.decode()] for k, v in m.get('headers', [])]",
  "        elif m['type'] == 'http.response.body':",
  "            chunks.append(m.get('body', b''))",
  "    return status, out_headers, b''.join(chunks)",
  "",
  "def run_without_threads():",
  "    # The browser has no threads. A plain 'def' route would fail, so it runs inline instead.",
  "    import anyio.to_thread",
  "    async def run_sync(func, *args, **kwargs):",
  "        return func(*args)",
  "    anyio.to_thread.run_sync = run_sync",
].join("\n");

let pyodide = null;
let booting = null;
let installed = new Set();

async function boot() {
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_URL + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage("micropip");
  pyodide.FS.writeFile("/home/pyodide/veda_asgi.py", ASGI_HELPER);
  pyodide.runPython("import sys\nsys.path.insert(0, '/home/pyodide')");
}

function parseRequirements(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line && !line.startsWith("-"));
}

async function install(specs) {
  const micropip = pyodide.pyimport("micropip");
  for (const spec of specs) {
    if (installed.has(spec)) continue;
    await micropip.install(spec);
    installed.add(spec);
  }
  micropip.destroy();
}

async function load(source, requirementsText) {
  if (!booting) booting = boot();
  await booting;
  await install(["fastapi", ...parseRequirements(requirementsText)]);
  pyodide.FS.writeFile("/home/pyodide/main.py", source);
  pyodide.runPython(
    "import sys, importlib\nfor name in ['main']:\n    sys.modules.pop(name, None)\nimport veda_asgi\nveda_asgi.run_without_threads()\nimport main"
  );
}

async function handleRequest(msg) {
  const asgi = pyodide.pyimport("veda_asgi");
  const app = pyodide.pyimport("main").app;
  const result = await asgi.handle(app, msg.method, msg.path, msg.query, pyodide.toPy(msg.headers), msg.body);
  const [status, headers, body] = result.toJs();
  result.destroy();
  asgi.destroy();
  postMessage({ type: "response", id: msg.id, status, headers, body });
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === "load") {
      await load(msg.source, msg.requirements);
      postMessage({ type: "ready" });
    } else if (msg.type === "request") {
      await handleRequest(msg);
    }
  } catch (err) {
    if (msg.type === "request") {
      const text = JSON.stringify({ detail: String(err && err.message ? err.message : err) });
      postMessage({ type: "response", id: msg.id, status: 500, headers: [["content-type", "application/json"]], body: new TextEncoder().encode(text) });
    } else {
      postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
    }
  }
};
`.replace("__PYODIDE_VERSION__", PYODIDE_VERSION);

const mainPy = String.raw`from fastapi import FastAPI
from pydantic import BaseModel

# The Python backend runs in your browser. Edit this file and save to change the API.
app = FastAPI(docs_url=None, openapi_url="/api/openapi.json")

items = [{"id": 1, "name": "Learn FastAPI"}]


class Item(BaseModel):
    name: str


@app.get("/api/hello")
async def hello():
    return {"message": "Hello from FastAPI, running in your browser"}


@app.get("/api/items")
def list_items():
    return items


@app.post("/api/items")
def add_item(item: Item):
    new_item = {"id": len(items) + 1, "name": item.name}
    items.append(new_item)
    return new_item
`;

const requirementsTxt = "# Extra Python packages for backend/main.py, one on each line. FastAPI is added for you.\n";

export const REACT_FASTAPI_FILES: Record<string, string> = {
  "package.json": packageJson,
  "vite.config.js": viteConfig,
  "index.html": indexHtml,
  "src/main.jsx": mainJsx,
  "src/App.jsx": appJsx,
  "src/index.css": indexCss,
  "src/python/api.js": apiJs,
  "src/python/worker.js": workerJs,
  "backend/main.py": mainPy,
  "backend/requirements.txt": requirementsTxt,
};
