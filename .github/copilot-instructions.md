# React TypeScript Vite Project Setup

## Project Setup Checklist

- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements - React + TypeScript + Vite
- [x] Scaffold the Project - Vite project scaffolded with react-ts template
- [x] Customize the Project - Fixed ESLint warnings
- [x] Install Required Extensions - No additional extensions needed
- [x] Compile the Project - All dependencies installed, no errors
- [x] Create and Run Task - Dev server available via `npm run dev`
- [x] Launch the Project - Ready to start
- [x] Ensure Documentation is Complete - README.md provided by Vite

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Information

This is a React 19 + TypeScript + Vite project with:
- Vite 7.2.7 for fast development and building
- React 19 with TypeScript support
- ESLint configured with recommended rules
- Hot Module Replacement (HMR) for instant updates

## Digital Twin MVP Integration Plan

- Current state: React SPA with a Digital Twin dashboard (`src/pages/dashboard.tsx`) simulating a 9-agent workflow; backend calls are stubbed.
- Backend/infra: use Cloudflare Workers + Wrangler; add Durable Object or KV for state and D1 for persistence when needed.
- Secrets: keep `GEMINI_API_KEY` and Cloudflare account IDs outside git; store via `wrangler secret put` and `.env` for local dev.
- API surface (Workers):
	1) `/agent/:role/init` + `/agent/:role/chat` for role-scoped actions;
	2) `/workflow` to orchestrate the 9-agent sequence; shape responses per `instructions.md` examples;
	3) optional `/status` for health/debug.
- Frontend wiring: replace simulated `simulateAgentWork` calls with fetches to the Worker API; thread prior outputs as context; show streaming or polling progress.
- Testing: add vitest coverage for API client helpers and UI state transitions; use `wrangler dev` for local end-to-end checks.
