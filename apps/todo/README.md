# Yörünge TODO

An independent React + Vite example app connected to STARBASE. It uses the shared `@starbase/sdk` client and vendored `@stardrop/ui` kit.

## Run locally

Start the STARBASE web/API stack first, then run this app separately:

```sh
npm run dev:todo
```

The app opens at `http://127.0.0.1:5180`. Copy `.env.example` to `.env.local` to override the STARBASE URL or client ID. Register the default `starbase-todo-web` client in the local STARBASE management screen with this exact redirect URI and origin:

- Redirect URI: `http://127.0.0.1:5180/callback`
- Origin: `http://127.0.0.1:5180`
- Scope: `profile`

Only the `profile` scope is requested. Do not add a client secret or Firebase credentials to this frontend.

## Authentication boundary

The app does not collect, store, or validate passwords. Its continue button calls the STARBASE SDK, which sends the browser to the central STARBASE account screen. Login and signup therefore share the same screen across applications; changing that central screen updates the shared flow. `/callback` exchanges the one-time PKCE code through the SDK, and logout is explicitly reported to STARBASE.

The app is intentionally a thin SDK consumer: `src/main.tsx` creates one `Starbase` client and wraps the app in `StarbaseAuthProvider`. `useStarbaseAuth()` supplies loading, anonymous, authenticated, login and logout behavior. New React projects can copy this small integration without rebuilding callback or token-refresh logic.

## Task data boundary

`src/features/tasks/taskRepository.ts` defines the storage contract and currently provides `LocalTaskRepository`. Data is namespaced by authenticated user ID in localStorage. Replace the repository implementation with an HTTP adapter when a TODO API is introduced; keep server authorization tied to the STARBASE access token and verify permissions on that server. Browser localStorage is only a development/demo store and is not cross-device or a server backup.
