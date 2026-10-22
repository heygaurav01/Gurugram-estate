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
  test("empty submit shows 2 errors, focuses name and announces the count", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200 });
    await openFrom(page, "hero");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".field__error:not(:empty)")).toHaveCount(2);
    await expect(page.getByLabel("Name")).toBeFocused();
    await expect(page.locator("[data-enquiry-live]")).toHaveText("2 fields need attention.");
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

  test("consent notice is shown above Send and linked to the button", async ({ page }) => {
    await openFrom(page, "hero");
    await expect(page.locator("#enq-consent-note")).toContainText(
      "By sending this form, you agree to be contacted",
    );
    await expect(page.getByRole("button", { name: "Send" })).toHaveAttribute(
      "aria-describedby",
      "enq-consent-note",
    );
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
    const copy = page.locator(".footer__bar p");
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

test.describe("nav popups", () => {
  const navCases: Array<[string, RegExp]> = [
    ["Amenities", /Get the amenity details first/],
    ["Gallery", /Get project images and updates/],
    ["Virtual Tour", /Get the virtual tour at launch/],
    ["Map", /Get location details/],
    ["Master & Floor Plan", /Get the official floor plans/],
    ["Pricing", /Get pricing when it is released/],
    ["Enquire now", /Register your interest/],
  ];
  for (const [label, heading] of navCases) {
    test(`nav "${label}" opens the enquiry modal`, async ({ page, isMobile }) => {
      if (isMobile) {
        await page.getByRole("button", { name: "Menu" }).click();
        await page.locator("#nav-sheet").getByRole("link", { name: label, exact: true }).click();
      } else {
        await page.locator(".nav").getByRole("link", { name: label, exact: true }).click();
      }
      await expect(page.locator("#enquiry-title")).toHaveText(heading);
    });
  }
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("revealed content is fully visible without animation", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    const hidden = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("[data-reveal]")).filter(
          (el) => getComputedStyle(el).opacity !== "1",
        ).length,
    );
    expect(hidden).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.classList.contains("reveal-ready")),
    ).toBe(false);
  });
});

test.describe("floating contact", () => {
  test("WhatsApp and Call stay fixed in the bottom-right corner while scrolling", async ({
    page,
  }) => {
    const fab = page.locator(".fab");
    await expect(fab).toBeVisible();
    const vp = page.viewportSize()!;
    for (const y of [0, 2500, 6000]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const box = (await fab.boundingBox())!;
      expect(box.x + box.width).toBeGreaterThan(vp.width - 40);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    }
  });
});

test.describe("hub", () => {
  test("coming soon hero and inline form validate and submit", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200, body: { id: "HUB-1" } });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Coming soon");
    const form = page.locator("[data-contact-form]");
    await form.getByRole("button", { name: "Send" }).click();
    await expect(form.locator(".cf__error:not(:empty)")).toHaveCount(2);
    await form.getByLabel("Name").fill("Ravi Kumar");
    await form.getByLabel("Mobile number").fill("98765 43210");
    await page.clock.fastForward(4000);
    await form.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/thank-you\/\?ref=HUB-1$/);
    expect(posts[0]).toMatchObject({ project_slug: "general", intent: "general", consent: true });
  });
});

test.describe("second project: M3M Brabus", () => {
  const M3M = "/m3m-brabus-sector-58-gurgaon/";
  test("renders in the noir theme with its own data and opens the enquiry modal", async ({
    page,
  }) => {
    await page.goto(M3M);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("M3M Brabus");
    await expect(page.locator("[data-enquiry]")).toHaveAttribute(
      "data-slug",
      "m3m-brabus-sector-58-gurgaon",
    );
    await page.locator('[data-enquire="hero"]').first().click();
    await expect(page.locator("#enquiry-title")).toHaveText(/Register your interest/);
  });

  test("submits a lead tagged with the M3M project and lands on its thank-you page", async ({
    page,
  }) => {
    const posts = await mockCrm(page, { status: 200, body: { id: "M3M-1" } });
    await page.goto(M3M);
    await openFrom(page, "floor-plan");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/m3m-brabus-sector-58-gurgaon\/thank-you\/\?ref=M3M-1$/);
    expect(posts[0]).toMatchObject({
      project_slug: "m3m-brabus-sector-58-gurgaon",
      intent: "floor-plan",
    });
  });

  test("homepage lists every live project", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cs__featured")).toHaveCount(5);
  });
});

test.describe("third project: Prestige Sector 92", () => {
  const PRESTIGE = "/prestige-sector-92-gurgaon/";
  test("renders the aurum theme with the arch hero, marquee and verified facts", async ({
    page,
  }) => {
    await page.goto(PRESTIGE);
    await expect(page.locator("html")).toHaveAttribute("data-motif", "aurum");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Prestige Sector 92");
    await expect(page.locator(".hero__arch")).toBeVisible();
    await expect(page.getByRole("region", { name: "Highlights" })).toContainText(
      "Near the Dwarka Expressway",
    );
    // Count-up is off under reduced motion: the real value is always in the HTML.
    await expect(page.locator(".facts")).toContainText("17.212");
    // No prices before RERA registration.
    await expect(page.locator("body")).not.toContainText("₹");
  });

  test("submits a lead tagged with the Prestige project", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200, body: { id: "PR-1" } });
    await page.goto(PRESTIGE);
    await openFrom(page, "amenities");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/prestige-sector-92-gurgaon\/thank-you\/\?ref=PR-1$/);
    expect(posts[0]).toMatchObject({
      project_slug: "prestige-sector-92-gurgaon",
      intent: "amenities",
    });
  });
});

test.describe("fourth project: M3M Franck Muller", () => {
  const FM = "/m3m-franck-muller-sector-43-gurgaon/";
  test("renders the horology theme with the tonneau hero, dial and locked plans", async ({
    page,
  }) => {
    await page.goto(FM);
    await expect(page.locator("html")).toHaveAttribute("data-motif", "horology");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("M3M Franck Muller");
    await expect(page.locator(".hero--tonneau .hero__archframe")).toBeVisible();
    await expect(page.locator("[data-watch-dial]")).toHaveClass(/is-live/);
    // Plans stay locked until M3M releases official ones.
    await expect(page.locator("#plans")).toContainText("Releases at launch");
    await expect(page.locator("body")).not.toContainText("₹");
  });

  test("submits a lead tagged with the Franck Muller project", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200, body: { id: "FM-1" } });
    await page.goto(FM);
    await openFrom(page, "virtual-tour");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/m3m-franck-muller-sector-43-gurgaon\/thank-you\/\?ref=FM-1$/);
    expect(posts[0]).toMatchObject({
      project_slug: "m3m-franck-muller-sector-43-gurgaon",
      intent: "virtual-tour",
    });
  });
});

test.describe("fifth project: Emaar Serenity Hills (RERA registered)", () => {
  const SH = "/emaar-serenity-hills-sector-86-gurgaon/";
  test("renders the botanica theme with RERA numbers, sizes and official plans", async ({
    page,
  }) => {
    await page.goto(SH);
    await expect(page.locator("html")).toHaveAttribute("data-motif", "botanica");
    await expect(page.locator(".hero--window")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Emaar Serenity Hills");
    await expect(page.locator(".hero")).toContainText("RC/REP/HARERA/GGM/993/725/2025/96");
    await expect(page.locator("#homes")).toContainText("1,576 sq ft");
    await expect(page.locator(".plans__preview")).toHaveCount(4);
    // Prices are on request from Emaar, so no rupee figures are published.
    await expect(page.locator("body")).not.toContainText("₹");
  });

  test("submits a lead tagged with Serenity Hills", async ({ page }) => {
    const posts = await mockCrm(page, { status: 200, body: { id: "SH-1" } });
    await page.goto(SH);
    await openFrom(page, "floor-plan");
    await fillValid(page);
    await page.clock.fastForward(4000);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/emaar-serenity-hills-sector-86-gurgaon\/thank-you\/\?ref=SH-1$/);
    expect(posts[0]).toMatchObject({
      project_slug: "emaar-serenity-hills-sector-86-gurgaon",
      intent: "floor-plan",
    });
  });
});

test.describe("map tap opens the enquiry popup on every project", () => {
  for (const slug of [
    "l-and-t-sector-86-gurgaon",
    "m3m-brabus-sector-58-gurgaon",
    "prestige-sector-92-gurgaon",
    "m3m-franck-muller-sector-43-gurgaon",
    "emaar-serenity-hills-sector-86-gurgaon",
  ]) {
    test(slug, async ({ page }) => {
      await page.route("https://www.google.com/**", (r) => r.fulfill({ status: 204 }));
      await page.goto(`/${slug}/`);
      const load = page.locator("[data-map-load]");
      await load.scrollIntoViewIfNeeded();
      await load.click();
      await expect(page.locator("[data-enquiry]")).toBeVisible();
      await expect(page.locator("#enquiry-title")).toBeVisible();
      await expect(page.locator(".map__iframe")).toHaveCount(1);
    });
  }
});
