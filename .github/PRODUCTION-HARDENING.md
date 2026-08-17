# Production hardening release gate

This branch contains low-risk production hardening only. It does not change timetable solver constraints or scheduling semantics.

Release requirements:

- CI runs on Node.js 24 to match the production Vercel runtime.
- Node dependencies are installed reproducibly with `npm ci`.
- Baseline browser-facing security headers are present in the built runtime.
- Web, solver, Docker, browser E2E, school-scale, full curriculum/export and repeated local-first workflows must all pass before merge.
- Production must still be deployed from the merged `main` commit and smoke-tested separately.
