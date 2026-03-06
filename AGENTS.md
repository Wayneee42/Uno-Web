# Repository Guidelines

## Project Structure & Module Organization
This repository is an npm workspace monorepo:
- `client/`: React + Vite frontend (`src/components`, `src/pages`, `src/contexts`)
- `server/`: Node + Express + Socket.IO backend (`src/game`, `src/socket`, `src/utils`)
- `shared/`: Shared TypeScript types/contracts consumed by client and server
- `docs/`: Project notes, task logs, and testing documentation

Keep cross-module game contracts in `shared/src/types` first, then consume them from `client` and `server`.

## Build, Test, and Development Commands
Run all commands from repository root unless noted.
- `npm run dev`: Builds `shared`, then starts client/server/shared watchers concurrently.
- `npm run build`: Builds all workspaces in dependency order.
- `npm run start`: Starts compiled server (`server/dist/index.js`).
- `npm run test`: Runs tests in all workspaces.
- `npm run test --workspace=client|server|shared`: Runs tests for one package.

Example: `npm run test --workspace=server` for backend logic only.

## Coding Style & Naming Conventions
- Language: TypeScript across all workspaces.
- Indentation: 2 spaces; include semicolons.
- Naming: `PascalCase` for React components/types, `camelCase` for variables/functions, descriptive file names (e.g., `RoomManager.ts`, `GameContext.tsx`).
- Tests: colocate with source using `*.test.ts` or `*.test.tsx`.

No dedicated lint script is currently defined; rely on `tsc`, Vitest, and existing code style in touched files.

## Testing Guidelines
- Framework: Vitest in all workspaces.
- Environments: client uses `jsdom`; server/shared use `node`.
- Add/update tests for every gameplay rule, socket handler, and shared type change.
- Favor deterministic assertions for game logic; keep simulation tests for cross-module confidence.

## Commit & Pull Request Guidelines
Recent history uses short, imperative summaries (e.g., `update game logic`, `add tests and other improvements`). Follow this style:
- Keep subject concise and action-oriented.
- Scope one logical change per commit.

For pull requests:
- Explain what changed and why.
- Link related issue/task when available.
- Include UI screenshots/GIFs for `client` visual changes.
- Confirm `npm run test` and relevant workspace builds pass.

## Security & Configuration Tips
- Use `.env` for local secrets; never commit real credentials.
- Keep `.env.example` updated when adding new environment variables.
