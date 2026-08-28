# Phase 9 — Landing Page, Branding & Logout

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 8 entry (real repo state) — all functional phases closed.
**Renumbers:** what was Phase 9 (Deployment) is now **Phase 10**. Rename its spec file `specs/phase-9-deployment.md` → `specs/phase-10-deployment.md` and update `progress.md`'s row before starting this phase, so the numbering is consistent by the time this closes.
**Why this phase exists:** a review of every prior spec turned up two real, concrete gaps — the root `/` route was never upgraded past Phase 1's Supabase connectivity placeholder, and no logout was ever specced anywhere. Both are fixed here, alongside giving the hypothetical clinic an actual identity.

---

## 0. Objective

By the end of this phase:
- Visiting the site's root shows a real public landing page for **Golden Friendship Family Clinic** — services, doctor bio, hours (read live from the database, not a hardcoded string that can drift), location, contact info — with clear paths to log in or sign up. Phase 1's debug placeholder is gone.
- Every authenticated dashboard (patient, receptionist, doctor) has a consistent header showing the clinic name and a working **sign out** button — closing the one functional gap that's existed since Phase 4.
- A light, consistent brand identity (name, tagline, accent color) applies across the landing page and the three dashboards — not a redesign of the dashboards' actual functionality, just enough visual consistency that this reads as one product rather than a bare admin tool.
- **The whole app is verified mobile-first, not just this phase's new pages.** This is a real adviser requirement surfaced late, not a nice-to-have: Phases 4–8 were built and tested against a desktop browser the entire way through, and nobody has confirmed whether the receptionist/doctor tables or the patient booking form actually hold up at phone width. §4B covers this explicitly — it's the highest-risk, most likely to actually need fixes, not just checking.

---

## 1. Single source of truth for clinic identity

`src/lib/brand.ts` — plain constants, imported everywhere branding text is needed, so the name/tagline/services list exists in exactly one place:

```ts
export const CLINIC = {
  name: "Golden Friendship Family Clinic",
  tagline: "Compassionate family care, right here in Kagay-an.",
  doctorName: "Dr. Andrea Villaflor",
  doctorSpecialty: "Family Medicine",
  address: "Corrales Avenue, Cagayan de Oro City",
  services: [
    "General Consultation",
    "Health Certificates",
    "Minor Procedures & Wound Care",
    "Preventive Health Screening",
    "Walk-in Checkups",
  ],
} as const;
```

Update `src/app/layout.tsx`'s `metadata` export (page title, description) to use `CLINIC.name`/`tagline` — the browser tab currently still says whatever `create-next-app`'s default was back in Phase 1.

---

## 2. Landing page — retiring Phase 1's placeholder

### 2.1 One new, narrow RLS policy

The landing page needs to show real operating hours, and `doctor_availability`'s only existing read policy (Phase 2) is `to authenticated` — an anonymous visitor has no session and currently can't read it. Add:

```sql
create policy "availability_select_anon" on doctor_availability
  for select to anon using (true);
```

**Worth being deliberate about this one:** every RLS policy in this project so far has been scoped `to authenticated` — this is the first `to anon` policy anywhere. That's a real category shift, not a copy-paste of the existing pattern, so it's worth confirming the reasoning holds rather than accepting it on autopilot: operating hours aren't sensitive (same reasoning Phase 3 used for slot times), and showing accurate, current hours to an anonymous visitor is the entire point of a public landing page. No write access is granted — `availability_write_doctor` (Phase 2) is untouched.

### 2.2 `src/app/page.tsx` — replaced, not extended

Phase 1's connectivity-check content is retired entirely (its job — proving the DB connection works — has been proven a hundred times over by every phase since). Sections, in order:
- **Hero:** clinic name, tagline, primary CTAs ("Log In" / "Sign Up").
- **Services:** `CLINIC.services`, plain list or simple cards.
- **About the doctor:** `CLINIC.doctorName` / `doctorSpecialty`, one short paragraph.
- **Hours:** queried live from `doctor_availability` (now readable via §2.1's policy) — formatted per day, e.g. "Mon–Fri, 9:00 AM – 5:00 PM" if the seeded pattern is uniform, or a per-day list if it's ever edited to vary (Phase 6 already built the doctor-facing editor for this table; this section is what makes those edits visible to the public for the first time).
- **Location & contact:** `CLINIC.address`, plus a placeholder contact method (a phone number isn't real yet — use a placeholder like "(088) 000-0000" clearly marked as illustrative, since there's no real clinic phone line behind this project).

### 2.3 `src/app/login/page.tsx` and `src/app/signup/page.tsx`

Add a small "back to home" link and the clinic name in a simple header — these currently exist as bare forms with no way back to the landing page short of the browser's back button.

---

## 3. Logout — the actual functional gap

### 3.1 `src/components/dashboard-header.tsx` — new shared component

One header, used by all three role layouts (`/patient`, `/receptionist`, `/doctor`), replacing whatever minimal wrapper each currently has:

- `CLINIC.name` (small, consistent branding — not a full nav menu, just identity).
- The signed-in user's role/name (from `getCurrentProfile()`, already built in Phase 2).
- A **Sign Out** button — calls `supabase.auth.signOut()` (client-side, since sign-out is a browser-session action) then redirects to `/`.

### 3.2 Wire into existing layouts

`src/app/patient/layout.tsx`, `src/app/receptionist/layout.tsx`, `src/app/doctor/layout.tsx` — each renders `<DashboardHeader>` above its page content. `requireRole()` in each stays exactly as built (Phase 4); this only adds the header around what's already there.

---

## 4. Light branding pass on existing dashboards

Per the scope decision for this phase: **add, don't redesign.** Concretely:
- An accent color applied consistently (pick one, e.g. via a Tailwind CSS variable already available in the shadcn setup from Phase 1) across primary buttons/headers on all three dashboards and the landing page.
- `CLINIC.name` visible in the shared header (§3.1) is most of what "feeling like one product" actually requires — the functional layouts, tables, and forms built in Phases 4–6 don't need restructuring.
- **Small, worthwhile tie-in:** Phase 7's SMS confirmation message currently doesn't name the clinic. Update its message template in `src/lib/sms/send-confirmation.ts` to include `CLINIC.name` (e.g., *"Your appointment at Golden Friendship Family Clinic on [date] at [time] is confirmed."*) — cheap, and a patient receiving a text that doesn't say who it's from is a real gap this branding pass should close while it's already touching identity.

---

## 4A. Using Impeccable and Vercel's Web Interface Guidelines

Both are already installed in this repo's OpenCode setup — this section is about *how* to invoke them for this phase specifically, not about installing anything.

**Vercel's Web Interface Guidelines skill applies broadly, with no scope caveat.** It's a correctness checklist (focus states, form behavior, loading states, accessible labels, copy tone), not a style generator — run it against everything new or touched this phase: the landing page, the login/signup pages' new "back to home" link, and the new `<DashboardHeader>` component. Nothing about it conflicts with "light rebrand" — a low-risk pass, apply it everywhere in scope. Two areas worth deliberately checking against it, since this phase's own additions land squarely in what it covers:
- **Login/signup forms** — `autocomplete`/`name` attributes for password manager support, error placement next to the relevant field (not a generic banner), Enter-to-submit, submit button disabled only during the in-flight request rather than pre-disabled on incomplete input.
- **Sign Out button and any new loading states** — loading buttons keep their label and show an indicator rather than swapping to a bare spinner; destructive-feeling actions (none of this phase's are truly destructive, but confirm) don't need a confirmation dialog for something as reversible as signing out.

**Impeccable needs a scope instruction each time it's invoked, not a blanket pass.** Its own philosophy defaults toward bold, maximalist creative freedom ("dream big," "no hedging") — genuinely the right mode for the landing page, since that page is close to a blank slate. It is **not** the right mode for the dashboards, where the instruction from earlier in this project was explicitly "light rebrand, don't redesign." Impeccable's own newer versions distinguish *addition* work (inherits the surrounding page's world, decides only what it introduces) from *redesign* work (replaces the old look) — use that distinction deliberately:
- **Landing page (`/`):** treat as new-page-in-existing-product — a fair amount of creative latitude is appropriate here, it's the one surface in this whole project that's allowed to be genuinely designed rather than just functional.
- **`<DashboardHeader>` and the accent-color pass (§4):** invoke Impeccable in scoped *addition* mode only — e.g. `/impeccable polish the dashboard header`, not `/impeccable redesign the dashboard`. The existing tables, forms, and tabs from Phases 4–6 are the "world" being inherited, not material up for reinterpretation.
- **Verify in one bounded pass, not a loop** — this matches Impeccable's own stated approach (build, inspect once across desktop and mobile together, fix everything found in one batch, confirm with at most one more round, stop). Don't let a `/impeccable critique` finding turn into an open-ended polishing cycle that eats time this phase doesn't need to spend.

---

## 4B. Mobile-first verification — across the whole app, not just this phase's additions

**Priority order, since not everything is equally at risk or equally important:** `/patient` (booking form + appointment list) and the new landing page first — patients are the group most likely to be on a phone, and this is the surface the adviser's requirement is really about. Then the receptionist and doctor dashboards — lower real-world urgency (likely used at a desk), but still need to not be actively broken at phone width.

**New surfaces (landing page, `<DashboardHeader>`) — design phone-first from the start.** No retrofitting needed here since they're being built in this phase anyway; just build them at 375px width first, then confirm they scale up, not the other way around.

**Existing surfaces (Phases 4–6's dashboards) — audit, then fix what's actually broken, don't rebuild what isn't.** Specifically check:
- **Tables** (receptionist's Pending Requests/Appointments tabs, doctor's Schedule tab) — the highest-risk component. A plain HTML-style table at phone width typically either overflows horizontally or becomes unreadable. Common fixes: horizontal scroll container with clear affordance, or collapsing to a stacked card layout below a breakpoint. Pick whichever is less invasive to the existing, already-tested table code — this is a fix pass, not a rebuild.
- **The walk-in registration form and patient booking form** — multi-step forms with a date picker and slot grid are easy to get wrong on a narrow screen (the shadcn `Calendar` component in particular is worth checking at 375px).
- **Dialogs** (the payment-confirmation dialog, Phase 4) — modal dialogs are a common mobile failure point (content overflowing the viewport, no way to scroll/dismiss).
- **Tap targets** — buttons and row actions sized for a mouse cursor may be too small/close-together for a thumb; Vercel's Web Interface Guidelines (§4A) already covers a minimum tap-target-size rule, apply it here specifically.

Use Impeccable in **addition** mode for these fixes, same discipline as §4A — the goal is "this table works on a phone now," not "this table has been redesigned."

---

## 5. Test Cases

**Automated (`scripts/test-phase9.ts`):**

1. `doctor_availability` is now readable by an unauthenticated (`anon`) request — confirm via a plain, unauthenticated client, no session at all.
2. `doctor_availability` remains unwritable by `anon` — the new policy is select-only; confirm an anonymous write attempt still fails.
3. Existing `to authenticated` read/write behavior on `doctor_availability` (Phase 2/6) is unchanged — regression check, not a new property.

**Manual, browser-based:**

4. Visit `/` while signed out — confirm the real landing page renders (services, doctor bio, hours, location), not Phase 1's old debug screen.
5. Change working hours via the doctor's Manage Availability tab (Phase 6), reload the landing page signed out, confirm the Hours section reflects the change — the cross-phase check that proves §2.2 is reading live data, not a cached or hardcoded value.
6. Sign in as each of the three roles in turn, confirm the shared header shows correctly, click Sign Out, confirm landing back on `/` and that hitting a protected route afterward (e.g. `/patient`) redirects to `/login` — session is actually cleared, not just visually hidden.
7. Confirm a real SMS confirmation (dry-run off, per Phase 7's one-deliberate-test pattern) now includes the clinic's name in the message body.
8. Login and signup pages show the "back to home" link and reach the real landing page when clicked.
9. Run the Vercel Web Interface Guidelines skill against the login/signup forms and the new `<DashboardHeader>`; address findings before closing the phase.
10. Run `/impeccable critique` scoped to the landing page and, separately, scoped to `<DashboardHeader>` — confirm the landing page pass was allowed real creative range while the dashboard-header pass stayed within *addition* mode (no restructuring of existing tables/forms). One fix batch, one confirming round, then stop, per §4A.
11. At a 375px-wide viewport: confirm the patient booking flow (date picker, slot selection, form submission) and the landing page are fully usable — nothing cut off, nothing requiring horizontal scroll to read, tap targets reachable with a thumb.
12. At the same viewport, confirm the receptionist's Pending Requests/Appointments tables and the doctor's Schedule table are at minimum not broken — readable and actionable, even if not as polished as the patient-facing surfaces per §4B's priority order.
13. Confirm the Phase 4 payment-confirmation dialog is fully visible and usable at 375px width, not clipped or unscrollable.

---

## 6. Explicitly out of scope

- A full visual redesign of the patient/receptionist/doctor dashboards — this phase adds identity and the missing logout, not a redesign pass.
- A real logo/image asset — text-based branding only; there's no actual artwork for this project.
- Any additional public pages beyond the single landing page (no separate `/about`, `/services`, `/contact` routes) — one page covers everything asked for in this phase's scope.

---

## 7. Handoff notes for OpenCode plan mode

- **§2.1's `to anon` policy is the one thing worth double-checking, not rubber-stamping** — every other policy in this project has been `to authenticated`; if plan mode wants to reuse `to authenticated` here out of habit, that would silently break the landing page for actual anonymous visitors, which is the entire point of this section.
- Don't let "light rebrand" (§4) expand into a design pass on Phases 4–6's tables, forms, or layouts — the instruction was additive, and scope creep here would be redoing work that's already tested and closed.
- After this phase closes, remind the human to rename `specs/phase-9-deployment.md` to `specs/phase-10-deployment.md` if that hasn't already been done, and confirm `progress.md`'s numbering matches before that phase starts.
- **§4A's scope split is the one to watch most closely this phase.** Impeccable's default instinct is to go bold everywhere it touches — that's correct for the landing page and wrong for the dashboards. If a `/impeccable` invocation ends up restructuring anything in Phases 4–6's tables, forms, or tab layout, that's the tool operating in the wrong mode for that surface, not a valid interpretation of "light rebrand" — stop and rescope the command rather than accepting the output.
- **§4B is a late-surfaced but real requirement, not an optional polish item — treat it with the same weight as the rest of this spec.** If time is tight, the priority order in §4B is the actual priority: get `/patient` and the landing page right first; the receptionist/doctor tables only need to not be broken, not be beautiful, at phone width.
