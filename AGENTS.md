# Project workflow

Create frequent local commits after every small, coherent change. Commit messages must be very short, clear, English, and entirely lowercase. Keep changes reviewable; do not squash away the incremental history. Do not push unless requested. Preserve unrelated user changes.

# STARBASE

Use the vendored @stardrop/ui components and B4 design language: black surfaces, white text, Michroma, thin borders and scrollbars, square-ended white selection markers. Keep identity, organization, authorization, applications, and profile sharing modular. Firebase Auth manages passwords; Cloudflare Workers and D1 host the API. Never log passwords, authorization codes, or tokens. Track application sign-in and explicit sign-out events automatically through the auth lifecycle. Do not infer online presence or fabricate sign-out times on window close. The team directory is available only to team members through central sessions.

# Shared notes

Team members can post board notes. Authors manage their own notes; owners and board.manage moderators manage all notes and pin them. Use optimistic versions to prevent lost edits. Persist notes in D1; WebSocket Hibernation broadcasts only invalidations, never note content or credentials. Recheck membership for all reads and writes. Preserve the monochrome design; do not add social feeds or chat features.
