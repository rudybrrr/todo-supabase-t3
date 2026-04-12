# Stride Distribution Plan

## Objective

Evolve Stride from a web-first product into installable distribution channels without rewriting the app.

Target outcomes:

- installable app experience on desktop and mobile
- app-store path for mobile
- downloadable desktop installer path

## Current Architecture Constraints

Stride is currently:

- Next.js 16 App Router frontend
- Supabase Auth + Postgres + Realtime + Storage backend
- browser session/auth flow
- responsive UI with client-heavy interactions

Implications:

- fastest path is progressive packaging, not native rewrite
- auth/session and upload flows must be validated in wrappers
- offline behavior should be explicit and bounded

## Recommended Sequence

1. PWA first
2. Mobile wrapper (Capacitor) second
3. Desktop wrapper (Tauri) third

This sequence minimizes architecture disruption and validates demand early.

## Phase 1: Installable PWA

### Scope

- web app manifest
- app icons and install metadata
- service worker for installability + minimal offline shell
- install UX testing across Chrome/Edge/Safari contexts

### Success criteria

- app is installable from supported browsers
- launches with correct branding/icon metadata
- auth and core task flows work in installed mode
- offline fallback behavior is understandable (no misleading data guarantees)

### Non-goals

- full offline editing
- background sync
- push notifications
- local database sync

## Phase 2: Mobile Packaging (Capacitor)

### Scope

- Capacitor shells for iOS and Android
- hosted app runtime inside webview wrapper
- auth/session validation on device
- upload and attachment validation on device

### Success criteria

- stable iOS and Android test builds
- login/logout/session persistence reliable
- task/planner/focus critical paths usable
- attachment uploads verified on physical devices

### Non-goals

- native navigation rewrite
- native offline database
- push notifications in first pass

## Phase 3: Desktop Packaging (Tauri)

### Scope

- Tauri shell for Windows/macOS
- installer generation and signing workflow prep
- hosted app runtime in desktop shell

### Success criteria

- Windows and macOS builds launch reliably
- auth and normal flows work as expected
- external links and uploads behave correctly

### Non-goals

- auto-update in first release
- heavy OS-native integrations
- bundled local database in first pass

## Readiness Checklist Before Phase 1

- [ ] finalize app icons and manifest metadata
- [ ] define explicit offline behavior copy
- [ ] verify auth redirects are environment-safe
- [ ] confirm storage upload paths and limits in installed contexts
- [ ] document support matrix by platform/browser

## Cross-Phase Risks

1. Supabase auth redirect/session behavior can differ in wrapped webviews.
2. File uploads may vary across iOS and Android webviews.
3. Service worker caching can produce stale asset behavior if cache policy is aggressive.
4. User expectations can be mis-set if offline capabilities are not clearly communicated.

## Operational Recommendation

Treat distribution as a packaging track after core reliability milestones, not as a replacement for product hardening.

## Verification For Packaging Work

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
