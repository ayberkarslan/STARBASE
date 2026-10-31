# Project workflow

Create frequent local commits after every small, coherent change. Commit messages must be very short, clear, English, and entirely lowercase. Keep changes reviewable; do not squash away the incremental history. Do not push unless requested. Preserve unrelated user changes.

# STARBASE

Use the vendored @stardrop/ui components and B4 design language: black surfaces, white text, Michroma, thin borders and scrollbars, square-ended white selection markers. Use pure black menu surfaces without gray item fills; prefer subtly rounded menu and button corners. The canonical UI reference is `/home/ayberk/Projects/B4/packages/ui-kit`; its local copy is `packages/ui`. Inspect the kit source and catalog before frontend design work, and never modify the original B4 directory. Keep identity, organization, authorization, applications, and profile sharing modular. Firebase Auth manages passwords; Cloudflare Workers and D1 host the API. Never log passwords, authorization codes, or tokens. Track application sign-in and explicit sign-out events automatically through the auth lifecycle. Do not infer online presence or fabricate sign-out times on window close. The team directory is available only to team members through central sessions.

# Private and shared notes

The default board is private: only its author can read or mutate a private note, including when another user is an owner or board.manage moderator. Keep personal live hubs separate by authenticated user. Scope is immutable. Team members can post shared board notes. Authors manage their own notes; owners and board.manage moderators manage all notes and pin them. Use optimistic versions to prevent lost edits. Persist notes and free canvas positions in D1; use independent layout versions for moves. WebSocket Hibernation broadcasts only invalidations, never note content or credentials. Recheck membership for all reads and writes. Preserve the monochrome design; do not add social feeds or chat features.
