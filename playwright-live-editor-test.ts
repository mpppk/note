import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const IS_LOCAL = BASE_URL.includes("localhost");
const RUN_ID = Date.now();
const EMAIL = IS_LOCAL
  ? (process.env.TEST_USER_EMAIL || "test@example.com")
  : `test-${RUN_ID}@example.com`;
const PASSWORD = process.env.TEST_USER_PASSWORD || "testpassword123";
const SCREENSHOT_DIR = "/tmp/live-editor-test-screenshots";

function gyazo(filePath: string): string {
try {
const output = execSync(`gyazo upload "${filePath}"`, { encoding: "utf8" });
const match = output.match(/url\s*:\s*(https:\/\/i\.gyazo\.com\/\S+)/);
return match ? match[1] : filePath;
} catch { return filePath; }
}

async function main() {
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 80 });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const shots: { label: string; url: string }[] = [];

async function shot(label: string) {
const file = path.join(SCREENSHOT_DIR, `${Date.now()}-${label}.png`);
await page.screenshot({ path: file });
const url = gyazo(file);
shots.push({ label, url });
console.log(`📸 ${label}: ${url}`);
}

async function go(url: string) {
await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
}

try {
// 1. Login (or signup on remote environments with unique email)
console.log("=== 1. Login ===");
if (!IS_LOCAL) {
  // On remote, create a fresh account with unique email
  console.log(`  Signing up as ${EMAIL}...`);
  await go("/signup");
  await page.waitForSelector('input[type="email"]');
  await shot("01-login");
  const nameInput = page.locator('input[id="name"]');
  if (await nameInput.count() > 0) await nameInput.fill("Test User");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.href.includes("/signup"), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
} else {
  await go("/login");
  await page.waitForSelector('input[type="email"]');
  await shot("01-login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.href.includes("/login"), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  if (page.url().includes("/login")) {
    // signup
    console.log("  Signup required...");
    await go("/signup");
    const nameInput = page.locator('input[id="name"]');
    if (await nameInput.count() > 0) await nameInput.fill("Test User");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(u => !u.href.includes("/signup"), { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}
await shot("02-logged-in");
console.log("  URL:", page.url());

// 2. Get or create org
console.log("=== 2. Org ===");
await go("/orgs");
await shot("03-orgs");

let orgId: string | null = null;
const orgLink = page.locator('main a[href*="/org/"]').first();
if (await orgLink.count() > 0) {
const href = await orgLink.getAttribute("href");
orgId = href?.match(/\/org\/([^/]+)/)?.[1] ?? null;
console.log("  Existing org:", orgId);
} else {
const uniqueSlug = `test-org-${RUN_ID}`;
console.log(`  Creating org (slug: ${uniqueSlug})...`);
await page.fill('#org-name', "Test Org");
await page.fill('#org-slug', uniqueSlug);
const btn = page.getByRole("button", { name: "Create" });
await btn.click();
await page.waitForTimeout(2000);
await go("/orgs");
const newLink = page.locator('main a[href*="/org/"]').first();
if (await newLink.count() > 0) {
const href = await newLink.getAttribute("href");
orgId = href?.match(/\/org\/([^/]+)/)?.[1] ?? null;
}
}
if (!orgId) throw new Error("No org found");
console.log("  orgId:", orgId);

// 3. Get or create team
console.log("=== 3. Team ===");
await go(`/org/${orgId}`);
await shot("04-org-page");

let teamId: string | null = null;
const teamLink = page.locator('main a[href*="/team/"]').first();
if (await teamLink.count() > 0) {
const href = await teamLink.getAttribute("href");
teamId = href?.match(/\/team\/([^/]+)/)?.[1] ?? null;
console.log("  Existing team:", teamId);
} else {
console.log("  Creating team...");
await page.fill('input[placeholder="Team name"]', "Test Team");
await page.getByRole("button", { name: "Create" }).click();
await page.waitForTimeout(2500);
await go(`/org/${orgId}`);
const newLink = page.locator('main a[href*="/team/"]').first();
if (await newLink.count() > 0) {
const href = await newLink.getAttribute("href");
teamId = href?.match(/\/team\/([^/]+)/)?.[1] ?? null;
}
}
if (!teamId) throw new Error("No team found");
console.log("  teamId:", teamId);

// 4. Get or create page
console.log("=== 4. Page ===");
await go(`/org/${orgId}/team/${teamId}`);
await shot("05-team-page");

let pageId: string | null = null;
const pLink = page.locator('main a[href*="/pages/"]').first();
if (await pLink.count() > 0) {
const href = await pLink.getAttribute("href");
pageId = href?.match(/\/pages\/([^/]+)/)?.[1] ?? null;
console.log("  Existing page:", pageId);
} else {
console.log("  Creating page...");
// Click the "New Page" button
const newPageBtn = page.getByRole("button", { name: /new page/i });
if (await newPageBtn.count() > 0) {
  await newPageBtn.click();
} else {
  const plusBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
  await plusBtn.click();
}
await page.waitForTimeout(800);
// fill title in dialog
const dlgInput = page.locator('[role="dialog"] input').first();
if (await dlgInput.count() > 0) {
  await dlgInput.fill("Live Preview Test");
  const createBtn = page.locator('[role="dialog"] button').filter({ hasText: /^Create$/ });
  await createBtn.click();
  await page.waitForTimeout(2500);
  await go(`/org/${orgId}/team/${teamId}`);
  const newLink = page.locator('main a[href*="/pages/"]').first();
  if (await newLink.count() > 0) {
    const href = await newLink.getAttribute("href");
    pageId = href?.match(/\/pages\/([^/]+)/)?.[1] ?? null;
  }
}
}
if (!pageId) throw new Error("No page found");
console.log("  pageId:", pageId);

// 5. Navigate to page detail
console.log("=== 5. Page Detail ===");
await go(`/org/${orgId}/team/${teamId}/pages/${pageId}`);
await shot("06-page-detail");

// 6. Add a text section if no editor yet
let hasCM = await page.locator(".cm-editor").count() > 0;
if (!hasCM) {
console.log("  No editor, adding text section...");
const ta = page.locator('textarea[placeholder*="Markdown" i]').first();
if (await ta.count() > 0) {
await ta.fill("Initial content");
await page.getByRole("button", { name: /add text/i }).click();
await page.waitForTimeout(1500);
await go(`/org/${orgId}/team/${teamId}/pages/${pageId}`);
hasCM = await page.locator(".cm-editor").count() > 0;
}
}

// 7. Test Live Preview
console.log("=== 6. Live Preview Editor ===");
console.log("  hasCM:", hasCM);

if (hasCM) {
await shot("07-editor-initial");
const cm = page.locator(".cm-content").first();
await cm.click();
// Go to end
await page.keyboard.press("Control+End");
await page.waitForTimeout(200);

// --- Heading ---
console.log("  Testing headings...");
await page.keyboard.type("\n\n# Heading One");
await page.waitForTimeout(300);
await shot("08-heading-while-typing");
await page.keyboard.press("ArrowDown");
await page.keyboard.type("paragraph after heading");
await page.waitForTimeout(300);
await shot("09-heading-rendered");

// --- Bold ---
console.log("  Testing bold...");
await page.keyboard.press("End");
await page.keyboard.type("\n**bold text**");
await page.waitForTimeout(300);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(300);
await shot("10-bold-rendered");
// click inside bold to reveal raw **
const boldEl = page.locator(".cm-md-bold").first();
if (await boldEl.count() > 0) {
await boldEl.click();
await page.waitForTimeout(300);
await shot("11-bold-raw-cursor");
}

// --- Italic ---
console.log("  Testing italic...");
await page.keyboard.press("End");
await page.keyboard.type("\n*italic text*");
await page.waitForTimeout(200);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(300);
await shot("12-italic-rendered");

// --- Inline code ---
console.log("  Testing inline code...");
await page.keyboard.press("End");
await page.keyboard.type("\n`inline code`");
await page.waitForTimeout(200);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(300);
await shot("13-inline-code-rendered");

// --- Link ---
console.log("  Testing link...");
await page.keyboard.press("End");
await page.keyboard.type("\n[link text](https://example.com)");
await page.waitForTimeout(200);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(300);
await shot("14-link-rendered");

// --- Code block ---
console.log("  Testing code block...");
await page.keyboard.press("End");
await page.keyboard.type("\n```\ncode here\n```");
await page.waitForTimeout(200);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(300);
await shot("15-code-block-rendered");

// --- Wait for autosave ---
console.log("  Waiting for debounce autosave...");
await page.waitForTimeout(2000);
await shot("16-after-autosave");

// --- Blur save ---
await page.locator("h1").first().click();
await page.waitForTimeout(600);
await shot("17-after-blur");

console.log("✅ Editor tests complete!");
} else {
await shot("07-no-editor");
console.log("❌ No editor found");
}

// 8. Dark mode
console.log("=== 7. Dark Mode ===");
const toggleBtn = page.locator('button[aria-label*="Toggle" i]').first();
if (await toggleBtn.count() > 0) {
await toggleBtn.click();
await page.waitForTimeout(500);
await shot("18-dark-mode");
await toggleBtn.click();
await page.waitForTimeout(300);
} else {
console.log("  No theme toggle found");
}

} finally {
await browser.close();
}

console.log("\n=== Screenshot Summary ===");
for (const s of shots) console.log(`- **${s.label}**: ${s.url}`);
}

main().catch(console.error);
