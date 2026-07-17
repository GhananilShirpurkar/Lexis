# Implementation Plan - Post-Account-Creation Onboarding Flow

Implement a 3-step onboarding wizard (`/onboarding`) with username selection, profile customization, interactive spotlight product tour, static avatar uploads, and route guard integration (`OnboardingGuard`).

## Confirmed Specifications
1. **Avatar Storage Strategy**:
   - Save avatar images to disk under `backend/static/avatars/{user_id}.{ext}`.
   - Serve static avatar URLs (e.g. `/static/avatars/...`) and store in `User.avatar_url`.
2. **Existing Users Data Migration**:
   - Automatically assign sanitized unique usernames derived from email local-parts (`john.doe@example.com` -> `john_doe` / `john_doe_1`).
   - Set `onboarding_completed = true` for existing users so active sessions are unimpeded.
3. **Step 1: Profile Setup Screen (`/onboarding`)**:
   - Username (required): 3-30 chars, alphanumeric + underscores, debounced API check.
   - Display Name (optional): Defaults to username.
   - Role / Use Case: Student, Researcher, Legal Professional, Developer, Other.
   - Actions: "Continue" (saves profile), "Skip for now" (sets `onboarding_completed: false`, redirects to dashboard with sidebar nudge banner).
4. **Step 2: Product Tour (Interactive Walkthrough)**:
   - Custom 300ms smooth glassmorphic spotlight ring overlay.
   - 5 stops: Query Tab, Library Tab, Console, Settings, Web Search Toggle.
   - Controls: Next / Prev / Skip Tour, Keyboard navigation (Arrows, Esc).
5. **Step 3: First Action Prompt & Nudge Flow**:
   - Completion redirects to Query tab with celebratory toast.
   - Resuming from Sidebar Nudge re-opens Step 1, offering choice after profile completion ("Take Product Tour" vs "Skip Tour").

---

## Detailed Task Breakdown

### Phase 1: Database Schema & Migration Script
- [ ] Update `backend/app/models/user.py` with `username`, `avatar_url`, `role`, `onboarding_completed`, `onboarding_skipped_at`.
- [ ] Create `backend/app/db/migrate_onboarding.py` migration script to auto-generate usernames for existing users and set `onboarding_completed = true`.
- [ ] Mount `/static` directory in `backend/app/main.py` for serving uploaded avatar images.

### Phase 2: Backend API Endpoints
- [ ] Update `backend/app/schemas/user.py` with `OnboardingRequest`, `OnboardingStatusResponse`, `UsernameCheckResponse`.
- [ ] Implement `GET /users/check-username?username=...` in `backend/app/routers/users.py`.
- [ ] Implement `PATCH /users/me/onboarding` & `POST /users/me/avatar` in `backend/app/routers/users.py`.
- [ ] Implement `GET /users/me/onboarding-status` in `backend/app/routers/users.py`.

### Phase 3: Frontend Route Guard & Context Updates
- [ ] Update `AuthContext.jsx` to store `onboarding_completed`, `onboarding_skipped_at`, `username`, `avatar_url`, `role`.
- [ ] Create `OnboardingGuard.jsx` to route un-onboarded users to `/onboarding`.
- [ ] Register `/onboarding` route in `App.jsx`.

### Phase 4: Step 1 Profile Setup & Avatar Cropper Upload
- [ ] Create `frontend/src/pages/OnboardingPage.jsx` (Step 1 form with debounced username validation & 1:1 image cropper/compressor).
- [ ] Support initial fallback avatars and static avatar file uploads.

### Phase 5: Step 2 Spotlight Tour Component & Sidebar Nudge
- [ ] Create `frontend/src/components/SpotlightTour.jsx` with viewport SVG bounding-rect cutout spotlight ring.
- [ ] Add `#nav-query`, `#nav-library`, `#nav-console`, `#nav-settings`, `#web-search-toggle` spotlight target IDs.
- [ ] Create `frontend/src/components/SidebarNudgeBanner.jsx` visible when `onboarding_completed === false`.

