# Repository Guidelines

## Project Structure & Module Organization

SitLess is an Electron + React + TypeScript desktop app. Main process code lives in `src/electron`, including tray integration, persistence, scheduling, and reminder windows. Renderer UI code lives in `src/renderer`, with `App.tsx`, `api.ts`, and `styles.css` as the primary files. Shared domain logic and types live in `src/shared`; prefer placing schedule, stats, defaults, and reminder-engine rules there when they are used by both Electron and tests. Static assets are in `assets`, documentation is in `docs`, and helper scripts are in `scripts`. Tests are colocated with source files as `*.test.ts`.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev:renderer`: start the Vite renderer dev server.
- `npm run dev:electron`: build Electron main code and run Electron against the dev renderer.
- `npm start`: build the app and launch Electron.
- `npm test`: run Vitest unit tests.
- `npm run build`: compile Electron TypeScript and build the Vite renderer.
- `npm run smoke:electron`: build and run the Electron smoke test.
- `npm run dist`: create the Windows installer with Electron Builder.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow existing formatting: two-space indentation, semicolons, single quotes, and explicit exported types for shared contracts. React components use PascalCase, helper functions use camelCase, and test files use the `moduleName.test.ts` pattern. Keep OS integration in `src/electron`, UI-only behavior in `src/renderer`, and pure logic in `src/shared`. Avoid broad refactors when a focused change is enough.

## Testing Guidelines

Vitest is the test runner. Add or update tests for scheduler behavior, persistence normalization, stats aggregation, and any shared logic changes. Prefer deterministic tests around pure functions in `src/shared`; use controller-level tests for reminder state transitions. Run `npm test` before handing off changes, and run `npm run smoke:electron` when Electron window, tray, IPC, or startup behavior changes.

## Commit & Pull Request Guidelines

The current history uses short imperative commit messages, for example `Enhance reminder tracking and settings`. Keep commits focused and describe the behavior changed. Pull requests should include a concise summary, test results, and screenshots or short notes for visible UI changes. Link related issues when available and mention any migration or local data impact.

## Security & Configuration Tips

User settings and stats are local JSON files under Electron `userData`; do not commit generated preview data such as `.tmp-preview-user-data`, `dist`, or `dist-electron`. Network-backed features, such as the daily poem API, must keep a local fallback path so the app remains usable offline.
