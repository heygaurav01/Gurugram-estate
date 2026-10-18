import { expect, test, type Page, type Route } from "@playwright/test";

const PROJECT = "/l-and-t-sector-86-gurgaon/";
const CRM = "https://crm.example.test/**";

type Reply = { status: number; body?: unknown } | "hang";

/** Intercept the CRM, answer CORS preflights, and record POST bodies. */
async function mockCrm(page: Page, replies: Reply[] | Reply) {
  const posts: Array<Record<string, unknown>> = [];
  const queue = Array.isArray(replies) ? [...replies] : null;
  await page.route(CRM, async (route: Route) => {
    const req = route.request();
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    posts.push(JSON.parse(req.postData() ?? "{}"));
    const reply = queue
      ? (queue.shift() ?? { status: 200, body: { id: "LEAD-1" } })
      : (replies as Reply);
    if (reply === "hang") return; // never answers; the client times out
    return route.fulfill({
      status: reply.status,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify(reply.body ?? {}),
    });
  });
  return posts;
}

async function openFrom(page: Page, intent: string) {
  const trigger = page.locator(`[data-enquire="${intent}"]:visible`).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.locator("[data-enquiry]")).toBeVisible();
  return trigger;
}

async function fillValid(page: Page) {
  await page.getByLabel("Name").fill("Ravi Kumar");
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel(/I agree to be contacted/).check();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto(PROJECT);
});

test.describe("triggers", () => {
  const cases: Array<[string, RegExp]> = [
    ["hero", /Register your interest/],
    ["pricing", /Get pricing when it is released/],
    ["floor-plan", /Get the official floor plans/],
    ["location", /Get location details/],
    ["footer", /Register your interest/],
  ];
  for (const [intent, heading] of cases) {
    test(`${intent} opens the modal with the right heading`, async ({ page }) => {
      await openFrom(page, intent);
      await expect(page.locator("#enquiry-title")).toHaveText(heading);
      await expect(page.getByLabel("Name")).toBeFocused();
    });
  }

  test("sticky bar opens the modal on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.locator('.sticky-bar [data-enquire="sticky"]').click();
    await expect(page.locator("#enquiry-title")).toHaveText(/Register your interest/);
  });
});

test.describe("validation", () => {
  test("empty submit shows 3 errors, focuses name and announces the count", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200 });
    await openFrom(page, "hero");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".field__error:not(:empty)")).toHaveCount(3);
    await expect(page.getByLabel("Name")).toBeFocused();
    await expect(page.locator("[data-enquiry-live]")).toHaveText("3 fields need attention.");
    expect(posts).toHaveLength(0);
  });

  test("invalid phone is blocked", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200 });
    await openFrom(page, "hero");
    await fillValid(page);
    await page.getByLabel("Mobile number").fill("5876543210");
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("#enq-phone-error")).toHaveText(/valid 10-digit Indian mobile/);
    await expect(page.getByLabel("Mobile number")).toHaveAttribute("aria-invalid", "true");
    expect(posts).toHaveLength(0);
  });

  test("unchecked consent blocks submit", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200 });
    await openFrom(page, "hero");
    await fillValid(page);
    await page.getByLabel(/I agree to be contacted/).uncheck();
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("#enq-consent-error")).toHaveText(/confirm/);
    expect(posts).toHaveLength(0);
  });
});

test.describe("submit", () => {
  test("success redirects to thank-you with the CRM lead id", async ({ page }) => {
    const posts = await mockCrm(page, { status: 201, body: { id: "LEAD-42" } });
    await openFrom(page, "pricing");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/thank-you\/\?ref=LEAD-42$/);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ intent: "pricing", phone: "+919876543210", consent: true });
  });

  test("double click sends exactly one request", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200, body: { id: "LEAD-1" } });
    await openFrom(page, "hero");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).dblclick();
    await page.waitForURL(/thank-you/);
    expect(posts).toHaveLength(1);
  });

  for (const [label, reply] of [
    ["HTTP 500", { status: 500 }],
    ["ok:false", { status: 200, body: { ok: false } }],
  ] as const) {
    test(`${label} shows the error state, keeps values and retries with the same key`, async ({
      page,
    }) => {
      const posts = await mockCrm(page, [reply, { status: 200, body: { id: "LEAD-9" } }]);
      await openFrom(page, "hero");
      await fillValid(page);
      await page.clock.fastForward(4000);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.locator("[data-enquiry-failure]")).toBeVisible();
      expect(page.url()).not.toContain("thank-you");
      await expect(page.getByLabel("Name")).toHaveValue("Ravi Kumar");
      await page.getByRole("button", { name: "Try again" }).click();
      await page.waitForURL(/ref=LEAD-9/);
      expect(posts).toHaveLength(2);
      expect(posts[1]!.idempotency_key).toBe(posts[0]!.idempotency_key);
    });
  }

  test("12 second timeout shows the error state", async ({ page }) => {
    await mockCrm(page, "hang");
    await openFrom(page, "hero");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: "Sending..." })).toBeDisabled();
    await page.clock.fastForward(12_500);
    await expect(page.locator("[data-enquiry-failure]")).toBeVisible();
    expect(page.url()).not.toContain("thank-you");
  });

  test("no personal data in storage, cookies or URL after submit", async ({ page, context }) => {
    await mockCrm(page, { status: 200, body: { id: "LEAD-5" } });
    await openFrom(page, "hero");
    await page.getByRole("textbox", { name: /^Email/ }).fill("ravi@example.in");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/thank-you/);
    const dump = await page.evaluate(() =>
      JSON.stringify({
        l: { ...localStorage },
        s: { ...sessionStorage },
        url: location.href,
        c: document.cookie,
      }),
    );
    const cookies = JSON.stringify(await context.cookies());
    for (const pii of ["Ravi", "9876543210", "ravi@example.in"]) {
      expect(dump).not.toContain(pii);
      expect(cookies).not.toContain(pii);
    }
  });
});

test.describe("modal behavior", () => {
  test("Esc closes and focus returns to the trigger", async ({ page }) => {
    const trigger = await openFrom(page, "pricing");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-enquiry]")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("backdrop click closes and focus returns to the trigger", async ({ page }) => {
    const trigger = await openFrom(page, "location");
    await page.mouse.click(5, 5);
    await expect(page.locator("[data-enquiry]")).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("layout", () => {
  test("sticky bar shows below 768px and does not cover the footer", async ({ page, isMobile }) => {
    const bar = page.locator(".sticky-bar");
    if (!isMobile) {
      await expect(bar).toBeHidden();
      return;
    }
    await expect(bar).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const copy = page.locator(".footer__copy");
    const copyBox = (await copy.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(barBox.y + 1);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("all content renders and CTAs fall back to the contact section", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/L&T Sector 86/);
    await expect(page.locator("#overview")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.locator('[data-enquire="hero"]').first()).toHaveAttribute("href", "#contact");
  });
});
