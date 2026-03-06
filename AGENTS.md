# Repository Guidelines

## Project Structure & Module Organization
This repository is a TypeScript monorepo using npm workspaces:
- `client/`: Vite + React frontend with Tailwind CSS. Main code lives in `client/src/` (`components/`, `contexts/`, `hooks/`, `pages/`).
- `server/`: Express + Socket.IO backend. Main code lives in `server/src/` (`game/`, `socket/`, `utils/`).
- `shared/`: Shared types and utilities consumed by client and server (`shared/src/`).
Built output is generated per package in `dist/` and should be treated as build artifacts.

## Build, Test, and Development Commands
Run commands from the repository root:
- `npm run dev`: start client and server together for local development.
- `npm run dev:client`: run only the Vite frontend.
- `npm run dev:server`: run only the backend with `tsx watch`.
- `npm run build`: build `shared`, then `client`, then `server`.
- `npm run start`: run the production server from `server/dist/index.js`.
Workspace-scoped example: `npm run build --workspace=client`.

## Coding Style & Naming Conventions
Use TypeScript with ES modules (`"type": "module"`). Follow existing file formatting; no formatter or linter is currently enforced.
- Components: PascalCase filenames and symbols (for example, `GameBoard.tsx`).
- Hooks: `useX` naming (for example, `useSocket.ts`).
- Contexts/providers: `XContext` and `XProvider` patterns.
Prefer clear, small modules and keep shared contracts in `shared/src/`.

## Testing Guidelines
No test framework is configured yet. When adding tests, include a workspace-appropriate tool (for example, Vitest) and wire a `test` script at root and package level. Name tests near source (`*.test.ts` / `*.test.tsx`) and prioritize game rules, socket flows, and critical UI state transitions.

## Commit & Pull Request Guidelines
Current history uses simple messages (for example, `baseline`), so use short imperative commit titles such as `Add lobby reconnection handling`.
For pull requests, include:
- concise summary of behavior changes,
- linked issue(s) when applicable,
- screenshots/GIFs for client-visible updates,
- notes on any new scripts, env vars, or migration steps.

## Configuration & Environment Notes
Use `.env.example` as the template for local settings. In development, the server entry is `server/src/index.ts`; production uses `server/dist/index.js`. Keep cross-package imports through `@uno-web/shared` where possible.