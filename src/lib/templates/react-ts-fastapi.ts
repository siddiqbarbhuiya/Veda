/**
 * Files of the "React + TypeScript + FastAPI" template: a to-do app.
 *
 * `backend/main.py` is a REST API (FastAPI, Python). It runs in the browser: Pyodide lives in a Web Worker
 * inside the preview page, and `src/python/client.ts` sends every `/api/...` call to it.
 * `src/` is a React + TypeScript app (Vite). The embedded code must not contain backticks or `${`.
 */

import { PYTHON_WORKER_JS } from "./react-fastapi";

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const packageJson = json({
  name: "react-ts-fastapi-app",
  private: true,
  version: "1.0.0",
  type: "module",
  scripts: {
    dev: "vite",
    build: "tsc --noEmit && vite build",
    typecheck: "tsc --noEmit",
  },
  dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
  devDependencies: {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    typescript: "^5.6.3",
    vite: "^5.4.11",
  },
});

const tsconfig = json({
  compilerOptions: {
    target: "ES2020",
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: "react-jsx",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    isolatedModules: true,
    types: ["vite/client"],
  },
  include: ["src", "vite.config.ts"],
});

const readme = String.raw`# React + TypeScript + FastAPI (to-do app)

- backend/main.py : the REST API (FastAPI, Python). It runs in your browser.
- src/            : the React + TypeScript app (Vite).
- src/python/     : connects fetch("/api/...") to the Python API. You do not need to change these files.

Run: npm install, then npm run dev
Check the types: npm run typecheck

The API keeps its data in memory. The data resets when the page reloads.
Edit backend/main.py and save. The page reloads and the API starts again.
`;

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
    <title>React + TypeScript + FastAPI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const viteEnv = String.raw`/// <reference types="vite/client" />
`;

// ---- backend (the REST API, Python) ----

const mainPy = String.raw`import itertools

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, field_validator

# The Python API runs in your browser. Edit this file and save to change the API.
app = FastAPI(docs_url=None, openapi_url="/api/openapi.json")


class NewTodo(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_is_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title is required")
        return value


class TodoUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None


# The data lives in memory. Replace this list with a database later.
todos: list[dict] = [
    {"id": 1, "title": "Read the API in backend/main.py", "done": True},
    {"id": 2, "title": "Add a todo in the React app", "done": False},
]
next_id = itertools.count(3)


def find_todo(todo_id: int) -> dict:
    for todo in todos:
        if todo["id"] == todo_id:
            return todo
    raise HTTPException(status_code=404, detail="Todo not found")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/todos")
def list_todos():
    return todos


@app.get("/api/todos/{todo_id}")
def get_todo(todo_id: int):
    return find_todo(todo_id)


@app.post("/api/todos", status_code=201)
def create_todo(body: NewTodo):
    todo = {"id": next(next_id), "title": body.title, "done": False}
    todos.append(todo)
    return todo


@app.patch("/api/todos/{todo_id}")
def update_todo(todo_id: int, body: TodoUpdate):
    todo = find_todo(todo_id)
    todo.update(body.model_dump(exclude_unset=True, exclude_none=True))
    return todo


@app.delete("/api/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: int):
    todos.remove(find_todo(todo_id))
    return Response(status_code=204)
`;

const requirementsTxt = "# Extra Python packages for backend/main.py, one on each line. FastAPI is added for you.\n";

// ---- front end (React + TypeScript) ----

const mainTsx = String.raw`import React from "react";
import ReactDOM from "react-dom/client";
// This line makes fetch("/api/...") talk to the FastAPI app in backend/main.py.
import { backendReady } from "./python/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App ready={backendReady} />
  </React.StrictMode>
);
`;

const typesTs = String.raw`// These types match the JSON that backend/main.py returns.
export type Todo = {
  id: number;
  title: string;
  done: boolean;
};
`;

const apiTs = String.raw`import type { Todo } from "./types";

type ErrorBody = { detail?: string | Array<{ msg?: string }> };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    const detail = Array.isArray(body.detail) ? body.detail[0]?.msg : body.detail;
    throw new Error((detail ?? res.statusText).replace(/^Value error, /, ""));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  list: () => request<Todo[]>("/api/todos"),
  create: (title: string) => request<Todo>("/api/todos", { method: "POST", body: JSON.stringify({ title }) }),
  setDone: (id: number, done: boolean) =>
    request<Todo>("/api/todos/" + id, { method: "PATCH", body: JSON.stringify({ done }) }),
  remove: (id: number) => request<void>("/api/todos/" + id, { method: "DELETE" }),
};
`;

const appTsx = String.raw`import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import type { Todo } from "./types";

export default function App({ ready }: { ready: Promise<void> }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  async function refresh() {
    try {
      setTodos(await api.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the API");
    }
  }

  useEffect(() => {
    let live = true;
    ready
      .then(async () => {
        if (!live) return;
        setStarting(false);
        await refresh();
      })
      .catch((err: Error) => live && setError("The Python API failed: " + err.message));
    return () => {
      live = false;
    };
  }, [ready]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.create(title);
      setTitle("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the todo");
    }
  }

  async function toggle(todo: Todo) {
    await api.setDone(todo.id, !todo.done);
    await refresh();
  }

  async function remove(todo: Todo) {
    await api.remove(todo.id);
    await refresh();
  }

  return (
    <main>
      <h1>React + TypeScript + FastAPI</h1>
      {starting ? <p className="status">Starting Python (the first start can take about 20 seconds)...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <form onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New todo" disabled={starting} />
        <button type="submit" disabled={starting}>
          Add
        </button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label className={todo.done ? "done" : ""}>
              <input type="checkbox" checked={todo.done} onChange={() => void toggle(todo)} />
              {todo.title}
            </label>
            <button type="button" aria-label={"Delete " + todo.title} onClick={() => void remove(todo)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">The list comes from the FastAPI app in backend/main.py. It runs in your browser.</p>
    </main>
  );
}
`;

const indexCss = String.raw`body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
  max-width: 32rem;
}

form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

input[type="text"],
input:not([type]) {
  flex: 1;
  font-size: 1rem;
  padding: 0.5rem 0.75rem;
}

button {
  font-size: 1rem;
  padding: 0.5rem 0.75rem;
}

ul {
  list-style: none;
  padding: 0;
}

li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.done {
  text-decoration: line-through;
  color: #6b7280;
}

.status {
  color: #b45309;
}

.error {
  color: #b91c1c;
}

.hint {
  color: #6b7280;
  font-size: 0.875rem;
}
`;

// The main-thread side, in TypeScript. It starts the worker and sends fetch("/api/...") to it.
const clientTs = String.raw`// Connects fetch("/api/...") to the FastAPI app that runs in a Web Worker (see worker.js).
import mainPy from "../../backend/main.py?raw";
import requirementsTxt from "../../backend/requirements.txt?raw";

type Reply = { status: number; headers: Array<[string, string]>; body: Uint8Array };
type FromWorker =
  | { type: "ready" }
  | { type: "error"; message: string }
  | ({ type: "response"; id: number } & Reply);

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map<number, (reply: Reply) => void>();
let nextId = 1;

/** Resolves when Python and FastAPI are ready. Rejects when they cannot start. */
export const backendReady = new Promise<void>((resolve, reject) => {
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    if (msg.type === "ready") resolve();
    else if (msg.type === "error") reject(new Error(msg.message));
    else {
      const done = pending.get(msg.id);
      pending.delete(msg.id);
      done?.(msg);
    }
  };
});

worker.postMessage({ type: "load", source: mainPy, requirements: requirementsTxt });

// Save backend/main.py and the page reloads, so the Python code starts again.
if (import.meta.hot) {
  import.meta.hot.accept(["../../backend/main.py?raw", "../../backend/requirements.txt?raw"], () => {
    window.location.reload();
  });
}

async function callBackend(request: Request): Promise<Reply> {
  await backendReady;
  const body = await request.text();
  const url = new URL(request.url);
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
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

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
    return realFetch(input, init);
  }
  const reply = await callBackend(request);
  const noBody = reply.status === 204 || reply.status === 304;
  return new Response(noBody ? null : (reply.body as BodyInit), { status: reply.status, headers: reply.headers });
};
`;

export const REACT_TS_FASTAPI_FILES: Record<string, string> = {
  "package.json": packageJson,
  "tsconfig.json": tsconfig,
  "README.md": readme,
  "vite.config.ts": viteConfig,
  "index.html": indexHtml,
  "backend/main.py": mainPy,
  "backend/requirements.txt": requirementsTxt,
  "src/vite-env.d.ts": viteEnv,
  "src/main.tsx": mainTsx,
  "src/types.ts": typesTs,
  "src/api.ts": apiTs,
  "src/App.tsx": appTsx,
  "src/index.css": indexCss,
  "src/python/client.ts": clientTs,
  "src/python/worker.js": PYTHON_WORKER_JS,
};
