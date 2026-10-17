# Project 2 Master Context: Carestack Solutions

**Solo founder: Hamid Bacaraman. BSIT 4103: AI Agency to AI Enterprise Transformation.**
Version 3.0 | 2026-09-28 | This single file supersedes every earlier hand-off.

**How to use it:** paste this whole file into a fresh chat, then send the line in section 9.

---

## 1. Who I am, and what I want from you

Act as my IT Management Consultant and Systems Analyst co-pilot.

- I am **Hamid Bacaraman**, and I am **solo**. There is no team, no partner, no co-founder.
- If you have seen an earlier hand-off mentioning a team, a founding team, or consultants, discard
  that framing. Everything is one person.
- Course context: BSIT, Liceo de Cagayan University (verify the institution name before printing).
- My audience is a class panel (the Shark Tank presentation) plus my own OJT and hiring portfolio.
  Both reward verifiable specifics over inflated claims.
- Produce one artifact at a time, in full, as structured Markdown. Then stop and wait for me.

---

## 2. What I am submitting

My adviser confirmed that not every element of the classroom instruction is required for this
submission. I am therefore cutting depth, not coverage: every item the brief names still appears.

| # | Artifact | Covers this brief item | Budget | Status |
|---|---|---|---|---|
| 0 | 7-slide pitch deck | The live presentation | done | Locked in an earlier chat |
| 1 | Company Portfolio | Company Portfolio | 3 pages | Next |
| 2 | AI Workforce Design, plus Enterprise Architecture and Data Flow | AI Workforce Design; Enterprise Architecture Diagram | 4 pages | Not started |
| 3 | Systems Administration and Cybersecurity Manual | Systems Administration Manual; Cybersecurity Plan | 4 pages | Not started |
| 4 | Live Demonstration Script | The live demonstration | 1 page | Not started |
| 5 | LinkedIn and Portfolio Project Description | LinkedIn-Ready Project Description | half a page | Not started |

**Depth rule.** Stay inside those budgets. Do not expand any artifact into a full standalone
specification. If something cannot fit, cut inside the artifact and tell me what you cut.

---

## 3. The company and the locked strategy

| Item | Decision |
|---|---|
| Company | Carestack Solutions, founded 2026, based in Cagayan de Oro City, Philippines |
| Niche | Independent medical, dental, and specialty clinics in the Philippines, exclusively |
| Flagship client | Golden Friendship Family Clinic, Dr. Andrea Villaflor, Cagayan de Oro City |
| Standard package | PHP 65,000 one-time setup plus PHP 2,800 per month |
| Package tiers | Starter PHP 35,000, Standard PHP 65,000, Managed PHP 110,000 one-time setup |
| Seed funding | US$10,000 (PHP 560,000), committed entirely to the internal AI Workforce Engine (API infrastructure, middleware integration, automated support pipelines) |
| Why that allocation | It removes the solo-founder bottleneck. Client count should grow faster than my headcount |
| Live demo workflow | Client Intake and Deployment Pipeline: intake form, AI Research Analyst audit, AI Virtual Project Manager spec generation, AI Customer Success manual drafting, then the human sign-off gate and system activation |
| Client-side stack | Next.js, Supabase, Semaphore SMS (this is built, see section 4) |
| Carestack internal stack | HubSpot CRM for leads, Microsoft 365 and Power Automate for intake processing, Power BI for MRR and deployment analytics, ChatGPT and Gemini APIs for reasoning. This tier is design, not built |
| Growth arc | 2026 startup (one clinic proof), 2028 regional (500 clinics, Visayas and Mindanao), 2030 national enterprise (Luzon plus specialty verticals), 2035 ASEAN |

**The three AI personas.** Virtual Project Manager, Virtual Research Analyst, and Virtual Customer
Success Specialist. Each one must be described as covering work I would otherwise have to hire for,
and each persona sheet must name the human gate that reviews its output.

**Solo-founder rules for everything you write.**

1. Write in the first person singular. Never "our team".
2. My public title is Founder. Today I am the CEO, the consultant, and the engineer.
3. Every human oversight gate belongs to me by name: intake confirmation, scope lock, specification
   approval, release sign-off, backup restore verification, and all incident communication.
4. 2026 is founder only. Propose the trigger at which the first human hire happens, label it as a
   proposal, then show 10 to 40 people by 2028 and 40 to 100 by 2030.
5. Solo is an advantage for the hiring portfolio: every artifact is demonstrably mine.

---

## 4. Track A: the real system (the evidence behind every claim)

This is the one system that genuinely exists. It is what makes the portfolio credible, so use it
wherever the artifacts need proof rather than a plan.

**What it is.** A web appointment system for one family clinic. Patients request appointments
online. The receptionist confirms at the desk after payment is arranged out of band, with the
reference logged manually. The doctor reads a confirmed schedule. Every confirmation and day-before
reminder sends by SMS and writes its own delivery record. A slot conflict is impossible because a
PostgreSQL constraint enforces it, not the interface. It is deliberately not an EMR: clinical
records, insurance, and telemedicine are out of scope permanently.

**Roles.** Patient: signs up, requests, reads own history, cannot confirm or cancel. Receptionist:
the hub, handling confirmation, walk-ins, reschedule, attendance, cancellation, fee logging,
settings, and reports. Doctor: read-only schedule, plus writes to weekly hours and closed dates only.

**Stack.** Next.js 16 App Router with TypeScript and Tailwind v4. Supabase running locally via CLI
and Docker on PostgreSQL 17. Row-Level Security plus explicit PostgREST grants for authorization.
`@supabase/ssr` cookie sessions with middleware refresh. zod for payload validation. Semaphore v4
for SMS. Recharts for charts. shadcn/ui for components. tsx to run the test harnesses.

**Two client paths, deliberately.** Everything a human does goes through the session-bound Supabase
client, so the database enforces the role. A service-role client exists only for server-side
background work (health check, slot lookup, patient reconciliation, reminder cron) and cannot be
imported into browser code because its module imports `server-only`.

**Schema.** Seven tables across eight migrations: `profiles`, `patients`, `doctor_availability`,
`availability_exceptions`, `appointments`, `sms_logs`, `clinic_settings`. A partial unique index
makes a duplicate booking on the same date and time impossible unless the existing row is CANCELLED.
Cancellation is a status change and rows are never deleted, so history survives. A second partial
index stops one login owning two patient records, and phone-number reconciliation reuses an existing
walk-in record instead of duplicating it.

**Security model (real, and this is the raw material for Artifact 3).**

1. Supabase Auth with email and password; a trigger on `auth.users` creates the matching profile.
2. Role comes from app metadata, defaulting to patient. Public signup cannot influence it, and an
   anti-escalation trigger blocks role changes afterwards.
3. RLS is enabled on every table with default deny. A security-definer helper, `get_my_role()`, lets
   policies branch on role. Patients reach only their own rows; receptionists have full appointment
   access; doctors see CONFIRMED appointments only; `sms_logs` is receptionist-only.
4. Field-level pinning: a patient's self-inserted request can only set source online, status PENDING,
   a patient row they own, and no payment fields. Payment method, reference, amount, and discount are
   staff-only facts, pinned to null by policy.
5. Service-role keys are confined to one `server-only` module and never touch a client-facing path.
6. Environment discipline: SMS is dry-run by default (`SEMAPHORE_DRY_RUN=true`), which short-circuits
   before any network call, so a development machine cannot message a real patient. Backend routes
   are gated by session, and the reminder cron requires a bearer secret.
7. Auditability: `updated_at` is maintained by trigger, and every state change carries the identity
   that made it.

**Delivery process.** Every phase: specification, plan, build, automated probes, human test gate,
then a commit. The commit only happens after a human has tested the phase in a browser. This caught
real problems worth citing: a service-role API key that would have been bundled into browser code, a
policy that let a patient self-assert a payment reference, and a Supabase client quirk where a denied
update is reported as success with zero rows (which forced explicit zero-row checks).

**Shipped and tested.** Nine phases: scaffold and schema; auth and role-based access; slot logic;
receptionist console; patient flow; doctor console; SMS with reminders; reports; and the public
landing page with branding. Then four post-phase features: receptionist in-place reschedule,
fee collections with a per-day chart, senior/PWD priority with discount prefill, and report charts
plus a print handout. Thirteen test harness scripts cover roughly 113 scripted checks against real
PostgREST paths with real sessions, plus a 26-render screenshot sweep across 13 routes on desktop and
mobile. The harnesses are manual and need a fresh database reset, so this is verification discipline
rather than continuous integration.

---

## 5. What I will not claim (state this plainly in every artifact)

1. **No production environment.** Hosting is the unstarted final phase. No platform chosen, no
   domain, nothing live. The system is built and tested on a local stack only.
2. **No real patient data, ever.** All data is test data created by harnesses. No pilot, no real
   user, no testimonial, no press.
3. **No multi-tenant isolation, yet.** My earlier hand-off called the security model multi-tenancy on
   a shared database isolated by RLS. RLS is real and is the correct mechanism, but there is no
   tenant column and the deployment is single-clinic. Write it as "tenant scoping is the planned
   extension of the existing RLS model", never as something already built.
4. **No continuous integration.** Harnesses run by hand.
5. **Imagery is a stand-in.** The doctor portrait is free-license stock photography, marked for
   replacement before launch.
6. **Projections are not traction.** 500 clinics by 2028 and 10,000 by 2030 are targets. Give them
   their own labelled column or sentence. Never mix them with the one client that exists.

---

## 6. Writing rules

1. No em dashes anywhere. Use plain hyphens.
2. Never invent a fact to fill a gap. Write `[TO CONFIRM: what is needed]` instead. A visible blank
   is acceptable; a fabricated registration number, domain, client, or metric is not.
3. Label anything you infer as a proposal, so I can accept or overrule it.
4. Plain, specific language. No hype words, no clinical outcome promises.
5. Structured Markdown, tables where a table beats prose.
6. Keep the permanent out-of-scope list intact: no full EMR, no insurance claims, no telemedicine,
   no payment gateway (manual reference logging only), no multi-branch, no patient self-service
   cancel or reschedule, no waitlisting, no email channel (SMS only), no Google Calendar
   integration, no clinical decision support.

---

## 7. The deck (locked in an earlier chat)

Seven slides exist and are locked. Their content is not in this file, so if an artifact has to match
the deck, ask me to paste the slide text before you write it.

Titles: 1 Growth Story, 2 Enterprise Architecture, 3 System Integration, 4 AI Workforce Design,
5 System Administration Plan, 6 Cybersecurity Strategy, 7 Scalability Roadmap.

Slide 2 and Slide 3 must stay consistent with the architecture in sections 3 and 4. Slide 4 must show
me as the only human worker for 2026 alongside the three AI personas.

---

## 8. Facts I have not given you

These are blanks until I say otherwise: DTI or SEC registration number, registered address, date
filed; domain name and whether it is registered; Starter and Managed monthly recurring fees; actual
Semaphore per-message cost; logo files or any finished brand asset; contract status of the Golden
Friendship engagement (paid engagement, pilot, or simulation); any testimonial or quotation.

---

## 9. Next action

Produce **Artifact 1: Company Portfolio**, within its 3-page budget, in full, structured Markdown,
using sections 3 and 4 for substance, section 5 for honesty, and section 6 for style.

It must contain, in this order:

1. Document control block: version, date, author Hamid Bacaraman, status
2. Executive summary: solo founder, one flagship client, seed committed to the AI Workforce Engine
3. Company identity: business snapshot, mission, vision, core values
4. Brand identity: positioning, tagline, logo specification, colour palette, typography, tone of voice
5. Market position: the problem, ideal client profile with disqualifiers, competitive landscape,
   differentiators
6. Service portfolio: core services, add-on services, permanent exclusions
7. Package tiers: pricing summary and a scope comparison across Starter, Standard, and Managed
8. Engagement lifecycle, with me named as every human gate
9. Operating model at 10 employees, 100 employees, and 10,000 clients
10. Growth arc 2026 to 2035
11. Commercial terms and service levels, condensed
12. Trust, privacy, and compliance posture, short, since the detail belongs in Artifact 3
13. Proof of work: the real system from section 4, with its honest status from section 5
14. Open items requiring my decision

Then stop and wait for my confirmation before Artifact 2.
