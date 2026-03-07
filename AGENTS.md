# Repository Guidelines

## Project Structure & Module Organization
This repository is a TypeScript monorepo with three workspaces:

- `client/`: Vite + React frontend. Main app code lives in `client/src`, static assets in `client/public`.
- `server/`: Express + Socket.IO backend. Entry point is `server/src/index.ts`; game and socket logic live under `server/src/game` and `server/src/socket`.
- `shared/`: Shared types and cross-package utilities in `shared/src`.
- `docs/`: project notes and deployment/testing docs.

Keep shared contracts in `shared` and import them through `@uno-web/shared` instead of duplicating types.

## Build, Test, and Development Commands
- `npm run dev`: builds `shared` first, then starts client, server, and shared watch tasks together.
- `npm run build`: builds all three workspaces in dependency order.
- `npm run test`: runs Vitest across all workspaces.
- `npm run test --workspace=client`: runs frontend tests in `jsdom`.
- `npm run test --workspace=server`: runs backend tests in `node`.
- `npm run start`: starts the compiled server from `server/dist`.

## Coding Style & Naming Conventions
Use 2-space indentation, LF line endings, UTF-8, and a final newline; these are enforced by `.editorconfig`. Prettier settings require single quotes, semicolons, trailing commas, `printWidth: 100`, and no parens for single-arg arrows.

Name React components and classes in `PascalCase`, functions and variables in `camelCase`, and test files as `*.test.ts` or `*.test.tsx`.

## Testing Guidelines
Vitest is the standard test runner in every workspace. Client tests use Testing Library with setup from `client/src/setupTests.ts`; server and shared tests run in Node.

Add or update tests with every behavior change, especially around room flow, game simulation, socket handlers, and shared type guards. Prefer focused unit tests plus integration coverage for cross-module behavior.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects such as `fix`, `UI`, and `public`; use a more descriptive version of that style, for example `fix lobby reconnect flow`. Keep one logical change per commit.

PRs should explain the user-visible change, note affected workspaces, list test commands run, and include screenshots for UI changes. Link related issues or task docs when available.

## Security & Configuration Tips
Copy `.env.example` when setting up local server configuration. Do not commit real secrets or environment-specific URLs. Validate CORS, socket event, and shared game-state changes across both client and server before merging.
