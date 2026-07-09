# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Focus Journal — an Electron desktop app for tracking focused work time, managing tasks/projects, and building daily habits.

## Commands

```bash
npm run dev        # Start Vite dev server (with Electron via vite-plugin-electron)
npm run build      # Type-check (tsc -b) + production build (vite build)
npm start          # Launch Electron app (requires dist/ to be built first)
npm test           # Run all tests (vitest run)
npm run lint       # ESLint (flat config)
npm run preview    # Preview production build
```

Run a single test file:
```bash
npx vitest run shared/time.test.ts
npx vitest run electron/services/focusJournal.test.ts
```

## Architecture

### Three-layer structure

- **`src/`** — React 19 frontend (single-page, no router library)
- **`electron/`** — Electron main process + services
- **`shared/`** — Types and utilities shared between frontend and backend

### IPC communication

Frontend calls backend via `window.focusJournal.*` (exposed by `contextBridge` in `preload.ts`). The full API surface is defined in `shared/types.ts` as the `FocusJournalApi` interface. Handlers are registered in `electron/main.ts` via `ipcMain.handle()`, and delegate to `electron/services/focusJournal.ts`.

### Database

SQLite via sql.js (WASM, file-backed). Schema in `electron/services/database.ts` — 5 tables: `categories`, `tasks` (supports projects with subtasks via `parent_id` and `kind` field), `time_entries`, `timer_sessions` (single-row, id=1), `app_settings`.

### Frontend architecture

All UI lives in a single file: `src/App.tsx` (~850 lines). Components are defined as nested functions inside `FocusJournalApp`. No external state management — ~60 `useState` hooks + `refresh()` to reload from backend. View switching uses a `View` union type (`'dashboard' | 'tasks' | 'timeline' | 'search' | 'habits'`) with conditional rendering.

### Key conventions

- **Styling**: CSS variables in `src/index.css`, component styles in `src/App.css` — plain CSS, no preprocessor
- **Icons**: `lucide-react`
- **Charts**: `recharts` (BarChart for trends)
- **Time utilities**: Custom functions in `shared/time.ts` (not date-fns, which is a dependency but unused)
- **TypeScript**: Strict mode enabled across both `tsconfig.app.json` and `tsconfig.node.json`
- **Shared code**: Both tsconfigs include `shared/` — changes there affect frontend and backend

### File locations at a glance

| What | Where |
|------|-------|
| All React components | `src/App.tsx` |
| Type definitions | `shared/types.ts` |
| IPC API contract | `shared/types.ts` → `FocusJournalApi` |
| Business logic | `electron/services/focusJournal.ts` |
| DB schema & init | `electron/services/database.ts` |
| Time/date utilities | `shared/time.ts` |
| Frontend format utils | `src/utils/format.ts` |
