/*
 * Design review harness.
 *
 * Captures every route at desktop and mobile widths, and — because screenshots
 * alone cannot be diffed by a machine — also asserts the structural things a
 * design pass can genuinely break: the route returns 200, no uncaught exception
 * or console error fires, exactly one h1 is present, and no page is left stuck
 * on a loading state.
 *
 *   npx tsx scripts/seed-staff.ts   # once, after a db reset
 *   node scripts/screenshot-review.mjs
 *
 * Writes to .impeccable/review/<route>-<viewport>.png and prints a PASS/FAIL
 * table. Local dev only.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = ".impeccable/review";

const STAFF_PASSWORD = "dev-password-only";
const REVIEW_PATIENT = {
  email: "review.patient@clinic.local",
  password: "review-password-123",
  fullName: "Review Patient",
  phone: "+639175550001",
};

mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { name: "landing", path: "/", as: null },
  { name: "login", path: "/login", as: null },
  { name: "signup", path: "/signup", as: null },
  { name: "receptionist-home", path: "/receptionist", as: "receptionist" },
  { name: "receptionist-pending", path: "/receptionist/pending", as: "receptionist" },
  { name: "receptionist-walkin", path: "/receptionist/walk-in", as: "receptionist" },
  { name: "receptionist-appointments", path: "/receptionist/appointments", as: "receptionist" },
  { name: "receptionist-reports", path: "/receptionist/reports", as: "receptionist" },
  { name: "receptionist-settings", path: "/receptionist/settings", as: "receptionist" },
  { name: "doctor-schedule", path: "/doctor/schedule", as: "doctor" },
  { name: "doctor-availability", path: "/doctor/availability", as: "doctor" },
  { name: "patient-book", path: "/patient/book", as: "patient" },
  { name: "patient-appointments", path: "/patient/appointments", as: "patient" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const CREDS = {
  receptionist: { email: "receptionist@clinic.local", password: STAFF_PASSWORD },
  doctor: { email: "doctor@clinic.local", password: STAFF_PASSWORD },
  patient: { email: REVIEW_PATIENT.email, password: REVIEW_PATIENT.password },
};

const results = [];

/**
 * base-ui's Input ignores Playwright's `fill` (which sets the value through the
 * native setter, bypassing React's change handling). Typing drives it for real.
 */
async function typeInto(page, selector, value) {
  await page.locator(selector).click();
  await page.locator(selector).pressSequentially(value, { delay: 2 });
  const actual = await page.locator(selector).inputValue();
  if (actual !== value) {
    throw new Error(`typing into ${selector} produced "${actual}"`);
  }
}

async function signIn(page, creds) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await typeInto(page, "#email", creds.email);
  await typeInto(page, "#password", creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15000,
  });
}

/** The review patient is disposable: create it if it is not there yet. */
async function ensurePatient(page) {
  try {
    await signIn(page, CREDS.patient);
    return;
  } catch {
    await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
    await typeInto(page, "#fullName", REVIEW_PATIENT.fullName);
    await typeInto(page, "#phone", REVIEW_PATIENT.phone);
    await typeInto(page, "#email", REVIEW_PATIENT.email);
    await typeInto(page, "#password", REVIEW_PATIENT.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/signup"), {
      timeout: 15000,
    });
  }
}

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const sessions = {};

  for (const route of ROUTES) {
    // Each role gets its own storage state so a session never leaks across
    // a route that expects another one.
    const key = route.as ?? "anon";
    if (route.as && !sessions[key]) {
      if (key === "patient") await ensurePatient(page);
      else await signIn(page, CREDS[key]);
      sessions[key] = await context.storageState();
    }

    consoleErrors.length = 0;
    pageErrors.length = 0;

    let status = 0;
    try {
      const response = await page.goto(`${BASE}${route.path}`, {
        waitUntil: "networkidle",
        timeout: 25000,
      });
      status = response?.status() ?? 0;
    } catch (e) {
      results.push({
        route: route.name,
        vp: vp.name,
        ok: false,
        notes: [`navigation failed: ${e.message}`],
      });
      continue;
    }

    await page.waitForTimeout(700); // let entrance motion settle

    const h1Count = await page.locator("h1").count();
    const bodyText = await page.locator("body").innerText();
    const stuck = /^Loading…?$/m.test(bodyText);
    const errorOverlay = await page.locator("nextjs-portal").count();
    const hasErrorText = /Application error|Unhandled Runtime Error/i.test(bodyText);
    const finalPath = new URL(page.url()).pathname;

    const notes = [];
    if (status >= 400) notes.push(`HTTP ${status}`);
    if (route.as && finalPath !== route.path) {
      notes.push(`redirected to ${finalPath} (session/role problem?)`);
    }
    if (h1Count !== 1) notes.push(`h1 count = ${h1Count}`);
    if (stuck) notes.push("stuck on a loading state");
    if (hasErrorText) notes.push("error boundary text on page");
    if (errorOverlay && hasErrorText) notes.push("nextjs error overlay");
    if (pageErrors.length) notes.push(`pageerror: ${pageErrors[0]}`);
    const realConsoleErrors = consoleErrors.filter(
      (t) => !/favicon|Download the React DevTools/i.test(t)
    );
    if (realConsoleErrors.length) {
      notes.push(`console: ${realConsoleErrors[0].slice(0, 140)}`);
    }

    const file = `${OUT}/${route.name}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: true });

    results.push({
      route: route.name,
      vp: vp.name,
      ok: notes.length === 0,
      notes,
    });
  }

  await context.close();
}

await browser.close();

// ── Report ────────────────────────────────────────────────────────────────
let failures = 0;
console.log("\nroute".padEnd(30) + "viewport".padEnd(10) + "result");
console.log("-".repeat(72));
for (const r of results) {
  if (!r.ok) failures++;
  console.log(
    r.route.padEnd(30) +
      r.vp.padEnd(10) +
      (r.ok ? "PASS" : `FAIL — ${r.notes.join("; ")}`)
  );
}
console.log("-".repeat(72));
console.log(
  failures === 0
    ? `All ${results.length} route/viewport combinations passed.`
    : `${failures} of ${results.length} failed.`
);
console.log(`Screenshots: ${OUT}/`);
process.exit(failures === 0 ? 0 : 1);
