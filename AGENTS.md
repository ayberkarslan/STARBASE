# Project workflow

Create frequent local commits after every small, coherent change. Commit messages must be very short, clear, English, and entirely lowercase. Keep changes reviewable; do not squash away the incremental history. Do not push unless requested. Preserve unrelated user changes.

# STARBASE

Use the vendored @stardrop/ui components and B4 design language: black surfaces, white text, Michroma, thin borders and scrollbars, square-ended white selection markers. Keep identity, organization, authorization, applications, and profile sharing modular. Firebase Auth manages passwords; Cloudflare Workers and D1 host the API. Never log passwords, authorization codes, or tokens. No online/activity tracking in v1.
