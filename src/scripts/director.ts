/**
 * Director page motion: intro reveal, portrait tilt and cursor glow, scroll
 * reveals, count-up numbers, word-by-word statement, stacked principle cards,
 * a pinned horizontal journey and the two pop-up dialogs.
 * Under reduced motion only the dialogs run; every element is visible as is.
 */

const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function initDirector(): void {
  initDialogs();
  if (reduce()) return;
  const root = document.documentElement;
  root.classList.add("dr-motion");

  const hero = document.querySelector<HTMLElement>("[data-dr-hero]");
  if (hero) {
    requestAnimationFrame(() => hero.classList.add("is-in"));
    if (finePointer()) initHeroPointer(hero);
  }
  initReveals();
  initCounters();
  initMagnetic();

  // Scroll-linked effects share one rAF-throttled handler.
  const statement = initStatement();
  const stack = initStack();
  const journey = initJourney();
  const parallax = initParallax();
  let ticking = false;
  const update = () => {
    statement?.();
    stack?.();
    journey?.();
    parallax?.();
    ticking = false;
  };
  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
}

function initHeroPointer(hero: HTMLElement): void {
  const portrait = hero.querySelector<HTMLElement>("[data-dr-portrait]");
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    hero.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    hero.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    portrait?.style.setProperty("--ry", `${((x - 0.5) * 10).toFixed(2)}deg`);
    portrait?.style.setProperty("--rx", `${((0.5 - y) * 8).toFixed(2)}deg`);
  });
  hero.addEventListener("pointerleave", () => {
    portrait?.style.setProperty("--ry", "0deg");
    portrait?.style.setProperty("--rx", "0deg");
  });
}

function initReveals(): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
  );
  document.querySelectorAll("[data-dr-reveal]").forEach((el) => io.observe(el));
}

function initCounters(): void {
  const run = (el: HTMLElement) => {
    const target = el.dataset.drCount ?? "";
    const end = Number(target);
    if (!Number.isFinite(end)) return;
    // Years count up from a nearby value; small numbers count from zero.
    const from = end > 1000 ? end - 40 : 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1600);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = t < 1 ? String(Math.round(from + (end - from) * eased)) : target;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        run(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.6 },
  );
  document.querySelectorAll<HTMLElement>("[data-dr-count]").forEach((el) => io.observe(el));
}

function initMagnetic(): void {
  if (!finePointer()) return;
  document.querySelectorAll<HTMLElement>("[data-dr-magnetic]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(1)}px`);
      el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height - 0.5) * 10).toFixed(1)}px`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--mx", "0px");
      el.style.setProperty("--my", "0px");
    });
  });
}

/** Lights the statement word by word as it scrolls through the viewport. */
function initStatement(): (() => void) | undefined {
  const section = document.querySelector<HTMLElement>("[data-dr-statement]");
  if (!section) return undefined;
  const words = Array.from(section.querySelectorAll<HTMLElement>("[data-w]"));
  return () => {
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const lit = Math.round(p * words.length * 1.15);
    words.forEach((w, i) => w.classList.toggle("is-lit", i < lit));
  };
}

/** Earlier principle cards shrink and dim as the next one slides over them. */
function initStack(): (() => void) | undefined {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-dr-card]"));
  if (cards.length < 2) return undefined;
  return () => {
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const a = card.getBoundingClientRect();
      const b = next.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, 1 - (b.top - a.top) / a.height));
      card.style.setProperty("--stack", p.toFixed(3));
    });
  };
}

/** Wide screens: vertical scroll drives the journey track sideways. */
function initJourney(): (() => void) | undefined {
  const section = document.querySelector<HTMLElement>("[data-dr-journey]");
  const track = section?.querySelector<HTMLElement>("[data-dr-track]");
  if (!section || !track) return undefined;
  const wide = window.matchMedia("(min-width: 900px)");
  let distance = 0;
  const measure = () => {
    if (!wide.matches) {
      section.style.height = "";
      track.style.transform = "";
      distance = 0;
      return;
    }
    distance = Math.max(0, track.scrollWidth - window.innerWidth);
    section.style.height = `${window.innerHeight + distance}px`;
  };
  measure();
  window.addEventListener("resize", measure);
  wide.addEventListener("change", measure);
  return () => {
    if (!distance) return;
    const r = section.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (r.height - window.innerHeight)));
    track.style.transform = `translate3d(${(-p * distance).toFixed(1)}px,0,0)`;
    section.style.setProperty("--progress", p.toFixed(3));
  };
}

function initParallax(): (() => void) | undefined {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-dr-parallax]"));
  if (els.length === 0) return undefined;
  return () => {
    const vh = window.innerHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      const speed = Number(el.dataset.drParallax) || 0.1;
      el.style.setProperty("--py", `${((r.top + r.height / 2 - vh / 2) * -speed).toFixed(1)}px`);
    });
  };
}

function initDialogs(): void {
  document.querySelectorAll<HTMLElement>("[data-dr-open]").forEach((btn) => {
    const dialog = document.getElementById(btn.dataset.drOpen ?? "") as HTMLDialogElement | null;
    if (!dialog) return;
    btn.addEventListener("click", () => dialog.showModal());
  });
  document.querySelectorAll<HTMLDialogElement>("dialog.dr-dialog").forEach((dialog) => {
    dialog
      .querySelectorAll("[data-dr-close]")
      .forEach((b) => b.addEventListener("click", () => dialog.close()));
    // A click on the backdrop (outside the panel) closes the dialog.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  });
}
