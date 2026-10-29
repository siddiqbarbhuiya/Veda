/**
 * Files of the "React + TypeScript + Express" template.
 *
 * One folder, two apps: `backend/` is a REST API (Express + TypeScript) and `frontend/` is a React + TypeScript
 * app (Vite) that calls it. A root package.json installs both and starts both with one command.
 * The embedded code must not contain backticks or `${`, so String.raw can hold it as it is.
 */

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const rootPackage = json({
  name: "react-ts-express",
  private: true,
  version: "1.0.0",
  scripts: {
    postinstall: "npm --prefix backend install && npm --prefix frontend install",
    dev: 'concurrently -n api,web -c blue,green "npm --prefix backend run dev" "npm --prefix frontend run dev"',
    typecheck: "npm --prefix backend run typecheck && npm --prefix frontend run typecheck",
  },
  devDependencies: { concurrently: "^9.1.0" },
});

const readme = String.raw`# React + TypeScript + Express

- backend/  : the REST API (Express + TypeScript). It listens on port 3000.
- frontend/ : the React + TypeScript app (Vite). It calls the API through /api.

Run both with: npm run dev
Check the types with: npm run typecheck

The API keeps its data in memory. The data resets when the server restarts.
`;

// ---- backend (the REST API) ----

const backendPackage = json({
  name: "api",
  private: true,
  version: "1.0.0",
  type: "module",
  scripts: {
    dev: "tsx watch src/index.ts",
    start: "tsx src/index.ts",
    typecheck: "tsc --noEmit",
  },
  dependencies: { express: "^4.21.2" },
  devDependencies: {
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.0",
    tsx: "^4.19.2",
    typescript: "^5.6.3",
  },
});

const backendTsconfig = json({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["node"],
  },
  include: ["src"],
});

const backendTypes = String.raw`export type Todo = {
  id: number;
  title: string;
  done: boolean;
};

/** The body of POST /api/todos. */
export type NewTodo = {
  title: string;
};

/** The body of PATCH /api/todos/:id. Send the fields that change. */
export type TodoUpdate = Partial<Pick<Todo, "title" | "done">>;
`;

const backendStore = String.raw`import type { NewTodo, Todo, TodoUpdate } from "./types";

// The data lives in memory. Replace this file with a database later.
const todos: Todo[] = [
  { id: 1, title: "Read the API in backend/src/index.ts", done: true },
  { id: 2, title: "Add a todo in the React app", done: false },
];
let nextId = 3;

export function listTodos(): Todo[] {
  return todos;
}

export function getTodo(id: number): Todo | undefined {
  return todos.find((t) => t.id === id);
}

export function createTodo(input: NewTodo): Todo {
  const todo: Todo = { id: nextId++, title: input.title, done: false };
  todos.push(todo);
  return todo;
}

export function updateTodo(id: number, changes: TodoUpdate): Todo | undefined {
  const todo = getTodo(id);
  if (!todo) return undefined;
  if (changes.title !== undefined) todo.title = changes.title;
  if (changes.done !== undefined) todo.done = changes.done;
  return todo;
}

export function deleteTodo(id: number): boolean {
  const index = todos.findIndex((t) => t.id === id);
  if (index < 0) return false;
  todos.splice(index, 1);
  return true;
}
`;

const backendIndex = String.raw`import express, { type NextFunction, type Request, type Response } from "express";
import { createTodo, deleteTodo, getTodo, listTodos, updateTodo } from "./store";
import type { TodoUpdate } from "./types";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

// Log each request: method, path, status.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.on("finish", () => console.log(req.method + " " + req.originalUrl + " -> " + res.statusCode));
  next();
});

function parseId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/todos", (_req: Request, res: Response) => {
  res.json(listTodos());
});

app.get("/api/todos/:id", (req: Request, res: Response) => {
  const id = parseId(req);
  const todo = id === null ? undefined : getTodo(id);
  if (!todo) return res.status(404).json({ error: "Todo not found" });
  res.json(todo);
});

app.post("/api/todos", (req: Request, res: Response) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "title is required" });
  res.status(201).json(createTodo({ title }));
});

app.patch("/api/todos/:id", (req: Request, res: Response) => {
  const id = parseId(req);
  if (id === null) return res.status(404).json({ error: "Todo not found" });
  const changes: TodoUpdate = {};
  if (typeof req.body?.title === "string" && req.body.title.trim()) changes.title = req.body.title.trim();
  if (typeof req.body?.done === "boolean") changes.done = req.body.done;
  const todo = updateTodo(id, changes);
  if (!todo) return res.status(404).json({ error: "Todo not found" });
  res.json(todo);
});

app.delete("/api/todos/:id", (req: Request, res: Response) => {
  const id = parseId(req);
  if (id === null || !deleteTodo(id)) return res.status(404).json({ error: "Todo not found" });
  res.status(204).end();
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(port, () => {
  console.log("API ready on port " + port);
});
`;

// ---- frontend (React + TypeScript) ----

const frontendPackage = json({
  name: "web",
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

const frontendTsconfig = json({
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
  },
  include: ["src", "vite.config.ts"],
});

const viteConfig = String.raw`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser calls /api on this server. Vite forwards it to the Express API on port 3000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
`;

const indexHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React + TypeScript + Express</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const mainTsx = String.raw`import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const frontendTypes = String.raw`// These types match backend/src/types.ts.
export type Todo = {
  id: number;
  title: string;
  done: boolean;
};
`;

const apiTs = String.raw`import type { Todo } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Request failed");
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

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setTodos(await api.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the API");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
      <h1>React + TypeScript + Express</h1>
      {error ? <p className="error">{error}</p> : null}
      <form onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New todo" />
        <button type="submit">Add</button>
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
      <p className="hint">The list comes from the Express API in backend/. Open the API on port 3000 in the Preview tab.</p>
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

.error {
  color: #b91c1c;
}

.hint {
  color: #6b7280;
  font-size: 0.875rem;
}
`;

export const REACT_TS_EXPRESS_FILES: Record<string, string> = {
  "package.json": rootPackage,
  "README.md": readme,
  "backend/package.json": backendPackage,
  "backend/tsconfig.json": backendTsconfig,
  "backend/src/types.ts": backendTypes,
  "backend/src/store.ts": backendStore,
  "backend/src/index.ts": backendIndex,
  "frontend/package.json": frontendPackage,
  "frontend/tsconfig.json": frontendTsconfig,
  "frontend/vite.config.ts": viteConfig,
  "frontend/index.html": indexHtml,
  "frontend/src/main.tsx": mainTsx,
  "frontend/src/types.ts": frontendTypes,
  "frontend/src/api.ts": apiTs,
  "frontend/src/App.tsx": appTsx,
  "frontend/src/index.css": indexCss,
};
