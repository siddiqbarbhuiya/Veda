# Veda Editor: Product Requirements Document

Status: draft 1, 2026-10-29. Owner: Siddiq. Audience: the owner and any engineer who builds the editor.

## 1. Why

Veda students write and run code in the browser and ask an AI for help with their own API key.
The current editor (Monaco, a file tree, a terminal, a chat) has gaps. A command in the terminal does not update the file tree.
Students expect what CodeSandbox and StackBlitz give: many frameworks, add packages, a live preview, an extension for the editor, and no setup.

## 2. Goals and non-goals

Goals
- One editor where the file tree, the terminal, the preview and the cloud copy always show the same files.
- Run Node.js frameworks and Python in the browser at no server cost to Veda.
- Add npm and pip packages with a command or a panel.
- Editor features that students know from VS Code: search, tabs, themes, snippets, extensions that work in the browser.
- The AI chat sees the project and can insert or change code.

Non-goals (version 1)
- Full VS Code desktop parity (native debuggers, Docker tools, Node language servers).
- Real-time multi-user editing.
- Cloud virtual machines for each user.
- Mobile phone editing.

Anti-goal: a clone that looks complete but loses student files. Data safety is more important than any feature.

## 3. R&D result: open-source options

I read the primary sources on 2026-10-29. Items marked UNVERIFIED are not confirmed from the project page.

| Option | What it gives | Licence | Fit for Veda |
|---|---|---|---|
| Sandpack ([source](https://github.com/codesandbox/sandpack)) | Editor, preview and bundler parts. It uses the CodeSandbox bundler | Apache-2.0 | Good for web frameworks (React, Vue, Vite, static). Free for a paid product |
| Sandpack Node templates (Nodebox, [source](https://github.com/codesandbox/nodebox-runtime)) | Node.js in the browser with npm install | Sustainable Use License. Commercial use only for your own business, or non-commercial or personal use. Paid distribution is not covered | Blocked for a paid product unless CodeSandbox gives a licence |
| codesandbox-client ([source](https://github.com/codesandbox/codesandbox-client)) | The old full CodeSandbox web app | GPLv3 for most of it. Apache-2.0 for 3 packages | Avoid. GPLv3 forces open source on Veda. The Apache packages are the Sandpack core |
| WebContainers (StackBlitz) | Node.js in the browser, the best framework support | Free for personal and open-source use. A commercial product needs a paid licence | Already in Veda. Needs the commercial licence before real revenue (UNVERIFIED price) |
| monaco-vscode-api (`@codingame`) | The real VS Code workbench in the browser, extensions from Open VSX | UNVERIFIED (confirm before use) | Spike runs. See section 6 |
| bolt.diy ([source](https://github.com/stackblitz-labs/bolt.diy)) | Open-source AI workbench (editor, terminal, preview, git, deploy) on WebContainers | MIT. It says "no new features are planned" | Good reference for the AI-chat plus workbench pattern. Not a base to fork |
| Eclipse Theia ([source](https://github.com/eclipse-theia/theia)) | IDE framework for browser and desktop, VS Code extension protocol | EPL-2.0 and GPL-2.0 with Classpath Exception | Heavy. A backend server is probably needed (UNVERIFIED). Skip |
| openvscode-server, code-server | Real VS Code on a server | MIT (from my own knowledge, UNVERIFIED) | Needs a server for each user. Breaks the zero-cost goal |

Conclusion: no open-source product gives the whole CodeSandbox experience for free in a paid product.
The parts we can reuse are the editor (Monaco or the VS Code workbench), Sandpack for web previews, and Open VSX for extensions.
The runtime is a licence decision, not a code problem.

## 4. How CodeSandbox is built (summary from the sources above)

- The editor and preview talk through an iframe and a message handshake (Sandpack client).
- Web frameworks run in an in-browser bundler. Node projects run in Nodebox (browser) or in a cloud microVM (server). I did not verify the microVM details. Mark them UNVERIFIED.
- Packages come from the npm registry through a cache. The runtime installs and caches them.
- Veda copies the same shape with its own parts: editor, file store, runtime, preview, package manager.

## 5. Users and top stories

| Story | Acceptance test |
|---|---|
| As a student I run `mkdir src` in the terminal and see `src` in the tree | Tree updates in under 1 second |
| I create a project from a template (Vite React, Next.js, Express, Python) | Preview or output shows in under 30 seconds on a normal laptop |
| I run `npm install lodash` or press "Add package" | `package.json` updates. The code can import the package |
| I run `pip install` for a pure Python package | The import works in Python |
| I change a file in the editor or the terminal | Both show the same text. The cloud copy is saved |
| I install a theme or language extension | It works after a reload |
| I ask the AI to change a file | I see a diff and I accept or reject it |
| I close the tab and come back | The same project opens. Another user never sees it |

## 6. Requirements

P0 (must have)
1. One file store is the source of truth. The tree, the editor, the terminal runtime and the cloud read and write through it.
2. Two-way sync between the runtime and the store. Changes from the terminal appear in the tree. Ignore `node_modules` and generated folders. Cap size at the 5 MB cloud limit.
3. Templates: Vite React, Express, Node script, Python, and React + FastAPI (FastAPI runs in the browser through Pyodide). Next.js and Vite vanilla later.
4. Package add for npm and for pure-Python pip packages.
5. Live preview panel with a reload button and an open-in-new-tab link. The preview page has another origin, so the editor cannot read its browser console. Server output shows in the terminal. A console and an error overlay need a script that the template adds to the page (later).
6. Search across files, tabs, a command palette, themes.
7. Safe storage: no loss on a failed sync, a conflict message, a ZIP export.

P1 (should have)
1. VS Code workbench with Open VSX extensions (the spike works for search; install is not proven).
2. Git clone, commit and push to GitHub.
3. Environment variables and secrets for a project.
4. AI chat that edits files with a visible diff (see section 6a).

## 6a. AI chat and agents (a dedicated panel, like VS Code)

The editor has a dedicated AI side panel. It is a first-class part of the editor, not an add-on.

Requirements
1. Model choice: the student picks any model from any provider with a saved BYOK key (OpenAI, Anthropic, Gemini now; more providers later, for example OpenRouter and a local Ollama URL). The panel shows "no key" next to a model without a key, with a link to add one.
2. Provider adapter layer: each provider is one adapter with the same interface (stream, stop, token count, error codes). A new provider needs one new file and no UI change.
3. Tabs in the panel, like the Claude Code tab in VS Code:
   - Chat: ask about the code. Answers stream. Code blocks have Insert, Copy and Apply.
   - Agent: the model plans and edits several files in steps. Each step shows as a diff. The student accepts or rejects each change. The agent can run a command in the terminal only after the student approves it.
   - History: past conversations for each project.
4. Context: the open file, the selection, chosen files (`@file`), terminal output, and preview errors. The panel shows what is sent, and its size.
5. Safety: the key stays on the server (AES-256-GCM, as now). The agent never gets the key. Commands and file deletes need approval. Limit of steps and cost for each run.
6. Billing: the hold and settle flow in paise stays. A failed call costs 0 paise. The panel shows the estimated cost before an agent run and the real cost after it.
7. Terminal commands, file edits and diffs go through the single file store (section 6, item 1), so the tree, editor and cloud always match.
8. Extension compatibility (P2): in the VS Code workbench, the same panel lives in the secondary side bar. Third-party AI extensions from Open VSX that need only the browser may run beside it.

Acceptance tests
- Switch from an OpenAI model to an Anthropic model in one chat. The next answer uses the new model.
- Remove a key. The model shows "no key" and a send gives the "Add your API key" message. Balance stays the same.
- The agent edits 3 files. The student rejects 1. Only 2 change. The tree and the cloud copy match.
- A wrong key gives the "key rejected" message and 0 paise cost.

P2 (later)
Share link, fork, embed, collaboration, deploy button.

## 7. Technical decisions to make

| Decision | Options | My recommendation |
|---|---|---|
| Runtime for Node | A: WebContainers with a commercial licence. B: Sandpack web templates only, no Node server. C: Nodebox after a licence from CodeSandbox | A for Node. Buy the licence before launch. B as a free fallback for static and React templates |
| Editor shell | A: current Monaco shell. B: VS Code workbench from monaco-vscode-api | Start with A. Move to B after P0 passes, behind a route `/ide-next` |
| File store | IndexedDB plus Supabase `projects` (exists) | Keep. Make it the single source of truth |
| Python | Pyodide in a Web Worker | Move to a worker. Scan its file system after each run |

## 8. Risks

| Risk | Effect | Step to reduce it |
|---|---|---|
| WebContainers needs a commercial licence | Legal risk at launch | Ask StackBlitz for the price now. Keep B as a fallback |
| Nodebox licence blocks paid use | Cannot use it | Do not use it without a written licence |
| VS Code workbench is heavy (12 MB chunk, 2.8 MB worker) | Slow first load | Lazy load. Keep the light editor as default |
| Two-way sync can delete files | Data loss | Tests first. A trash copy for 30 days. The 5 MB cap |
| Extensions that need Node do not run | User confusion | Show a clear "not supported in the browser" message |

## 9. Success measures

- Terminal-to-tree sync works in 100% of the test matrix rows.
- A Vite React template shows a preview in under 30 seconds.
- 0 data-loss bugs in the first month.
- First load of the default editor stays under 3 MB compressed.

## 10. Build order ("from the beginning")

1. Phase 0: the file store and the two-way sync (fixes the folder bug).
2. Phase 1: templates, package add, preview panel and console.
3. Phase 2: search, palette polish, git, environment variables.
4. Phase 3: VS Code workbench and extensions at `/ide-next`. The spike is saved on the git branch `spike/vscode-workbench`.
5. Phase 4: provider adapter layer, Chat and Agent tabs with diffs (section 6a), share and fork.

Each phase ends with: tests, the test matrix, a live smoke test, and a note in `docs/setup/environment.md`.

## 11. Decisions (owner, 2026-10-29)

1. Node runtime: keep WebContainers. Plan the commercial licence before revenue. Sandpack web templates are the free fallback. The price is still not known.
2. The first public launch may use the free Sandpack-only mode (web templates and Python). Node follows after the licence.
3. Templates: Python (Pyodide), Node script, Vite + React, Express server.
4. Start Phase 0 now.
