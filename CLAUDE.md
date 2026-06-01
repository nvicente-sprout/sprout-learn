# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # serve public/ at http://localhost:3001
vercel --prod    # deploy to production
```

## Architecture

Static SPA (`public/`) + Vercel serverless functions (`api/`).

**Frontend** loads 10 plain `<script>` tags in this order — all global scope, no ES modules (required for inline `onclick` handlers):

| File | Contents |
|---|---|
| `js/config.js` | Constants, initial data, state variables |
| `js/utils.js` | Notifications, helpers, gamification (XP, badges, confetti) |
| `js/data.js` | Supabase data layer, auth, realtime subscriptions |
| `js/layout.js` | Router, SCORM 1.2 postMessage bridge, login, shell layout |
| `js/admin-courses.js` | Admin dashboard, course management, all course-add modals, question builder |
| `js/admin-people.js` | Assign modal, admin team progress view |
| `js/admin-reports.js` | Settings, leaderboard, admin reports |
| `js/games.js` | Flappy Sprout (runner), Duck Hunt canvas games |
| `js/learner.js` | Learner dashboard, library, course viewer, assessment, certificate, learning paths |
| `js/icons.js` | SVG icon helper functions |

**API** (`api/`): Vercel serverless ES modules.
- `api/generate-questions.js` — proxies Gemini API; tries models in preference order, falls back on 429/503
- `api/fetch-content.js` — fetches YouTube transcripts and Google Slides text server-side
- `api/config.js` — single env reader; `required()` throws on missing vars (no silent defaults)

**Backend**: Supabase (Postgres + Auth + Storage + Realtime). The anon key in `config.js` is intentionally public — RLS enforces access control. Gemini API key is server-side only.

## Auth — SSO Migration Path (Rule 25)

Current auth uses Supabase Google OAuth (prototype-grade). Accepted email domains: `@sprout.ph`, `@sproutsolutions.io`.

Production migration target: **Keycloak** (or equivalent SSO).

When migrating:
- The `handleAuthUser` function in `data.js` is the single auth entry point — replace its Supabase auth call with a Keycloak token exchange there
- All route protection flows through `currentUser` — no auth logic is scattered elsewhere
- Protected routes: everything except `/login`
- Claims the production token must carry: `id`, `email`, `is_admin`, `team_id`
- The `googleLogin()` / `logout()` functions in `data.js` are the only call sites to swap

Schedule migration before any external rollout; Supabase OAuth is not suitable for production at scale.

## Key Conventions

- All functions that HTML `onclick` attributes call must remain in global scope — do not convert to ES modules
- New env vars go in `api/config.js` using the `required()` helper; never read `process.env` directly elsewhere
- Supabase anon key in `config.js` is intentionally public — never move it server-side; add RLS policies instead
