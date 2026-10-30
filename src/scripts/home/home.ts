/**
 * Homepage motion: the scroll-driven "enter the building" intro, chapter text,
 * the pinned project gallery, the elevator floor indicator, cursor, tilt,
 * tap ripples and sound cues.
 *
 * Content is real HTML and fully readable without JS. Under reduced motion
 * none of this runs; without WebGL the intro uses the still image instead.
 */
import { createSound, soundWasOn, type Sound } from "./sound";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function initHome(): void {
  const sound = createSound();
  initSoundToggle(sound);
  initTapFeedback(sound);
  initFloors(sound);
  if (reduce) return;

  document.documentElement.classList.add("home-live");
  initIntro(sound);
  initGallery();
  initSteps();
  if (finePointer) {
    initCursor();
    initTilt();
    initMagnetic();
  }
}

// --- intro -----------------------------------------------------------------------

function initIntro(sound: Sound) {
  const root = document.querySelector<HTMLElement>("[data-tower]");
  if (!root) return;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-tower-canvas]");
  const chapters = [...root.querySelectorAll<HTMLElement>("[data-chapter]")];
  const fade = root.querySelector<HTMLElement>("[data-tower-fade]");
  const meter = root.querySelector<HTMLElement>("[data-tower-meter]");
  root.classList.add("is-live");

  let scene: import("./scene").TowerScene | undefined;
  let progress = 0;
  let doorsCued = false;
  let liftCued = false;

  const measure = () => {
    const r = root.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? clamp01(-r.top / span) : 0;
  };

  const paint = () => {
    progress = measure();
    for (const ch of chapters) {
      const from = Number(ch.dataset.from);
      const to = Number(ch.dataset.to);
      const edge = Math.min(0.05, (to - from) / 3);
      // The first chapter is already visible at the top of the page.
      const enter = from <= 0 ? 1 : smooth(from, from + edge, progress);
      const leave = to >= 1 ? 0 : smooth(to - edge, to, progress);
      const a = enter * (1 - leave);
      ch.style.setProperty("--a", a.toFixed(3));
      ch.style.setProperty("--y", `${((1 - enter) * 40 - leave * 40).toFixed(1)}px`);
      ch.classList.toggle("is-on", a > 0.5);
      ch.inert = a < 0.05;
    }
    fade?.style.setProperty("--a", smooth(0.93, 1, progress).toFixed(3));
    meter?.style.setProperty("--p", progress.toFixed(4));
    root.style.setProperty("--p", progress.toFixed(4));
    scene?.setProgress(progress);

    // Sound cues, re-armed when the visitor scrolls back out.
    if (progress > 0.47 && !doorsCued) {
      doorsCued = true;
      sound.whoosh();
    }
    if (progress < 0.4) doorsCued = false;
    if (progress > 0.92 && !liftCued) {
      liftCued = true;
      sound.ding();
    }
    if (progress < 0.85) liftCued = false;
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paint();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  paint();

  if (!canvas || !supportsWebGL()) return;
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
    true;
  const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4 || saveData;

  const start = async () => {
    await document.fonts?.ready;
    const { createTowerScene } = await import("./scene");
    scene = createTowerScene(canvas, { lowPower });
    scene.setProgress(progress);
    root.classList.add("has-3d");
    new IntersectionObserver(([e]) => scene?.setActive(Boolean(e?.isIntersecting))).observe(root);
    if (finePointer) {
      window.addEventListener("pointermove", (e) => {
        scene?.setPointer(
          (e.clientX / window.innerWidth) * 2 - 1,
          (e.clientY / window.innerHeight) * 2 - 1,
        );
      });
    }
  };
  if (document.readyState === "complete") void start();
  else window.addEventListener("load", () => void start(), { once: true });
}

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

// --- pinned horizontal gallery (desktop) -------------------------------------------

function initGallery() {
  const root = document.querySelector<HTMLElement>("[data-hscroll]");
  const track = root?.querySelector<HTMLElement>("[data-hscroll-track]");
  const bar = root?.querySelector<HTMLElement>("[data-hscroll-bar]");
  if (!root || !track) return;
  const wide = window.matchMedia("(min-width: 900px)");
  const cards = [...track.querySelectorAll<HTMLElement>("[data-card]")];

  let distance = 0;
  const layout = () => {
    if (!wide.matches) {
      root.style.removeProperty("height");
      track.style.removeProperty("transform");
      root.classList.remove("is-pinned");
      return;
    }
    root.classList.add("is-pinned");
    // The track starts beside the heading, so its own offset counts too.
    distance = Math.max(0, track.offsetLeft + track.scrollWidth - window.innerWidth);
    root.style.height = `${window.innerHeight + distance}px`;
    paint();
  };
  const paint = () => {
    if (!wide.matches) return;
    const r = root.getBoundingClientRect();
    const q = distance > 0 ? clamp01(-r.top / distance) : 0;
    track.style.transform = `translate3d(${(-q * distance).toFixed(1)}px,0,0)`;
    bar?.style.setProperty("--p", q.toFixed(4));
    const mid = window.innerWidth / 2;
    for (const c of cards) {
      const b = c.getBoundingClientRect();
      const off = (b.left + b.width / 2 - mid) / window.innerWidth;
      c.style.setProperty("--off", off.toFixed(3));
    }
  };
  let queued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        paint();
      });
    },
    { passive: true },
  );
  window.addEventListener("resize", layout);
  wide.addEventListener("change", layout);
  // Images change the track width as they load.
  window.addEventListener("load", layout, { once: true });
  layout();
}

// --- "How we work": the gold line draws as you read ----------------------------------

function initSteps() {
  const root = document.querySelector<HTMLElement>("[data-steps]");
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>("[data-step]")];
  const paint = () => {
    const r = root.getBoundingClientRect();
    const mid = window.innerHeight * 0.6;
    root.style.setProperty("--p", clamp01((mid - r.top) / r.height).toFixed(4));
    for (const it of items) it.classList.toggle("is-on", it.getBoundingClientRect().top < mid);
  };
  window.addEventListener("scroll", () => requestAnimationFrame(paint), { passive: true });
  paint();
}

// --- elevator floor indicator ------------------------------------------------------------

function initFloors(sound: Sound) {
  const panel = document.querySelector<HTMLElement>("[data-floors]");
  if (!panel) return;
  const readout = panel.querySelector<HTMLElement>("[data-floor-readout]");
  const links = [...panel.querySelectorAll<HTMLAnchorElement>("a[data-floor-link]")];
  const sections = links
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter((s): s is HTMLElement => Boolean(s));
  let current = "";
  const update = () => {
    const probe = window.innerHeight * 0.45;
    let active = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= probe) active = s;
    if (!active || active.id === current) return;
    const first = current === "";
    current = active.id;
    for (const a of links) {
      const on = a.hash === `#${current}`;
      a.classList.toggle("is-on", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
      if (on && readout) readout.textContent = a.dataset.floor ?? "";
    }
    if (!first) sound.tap();
  };
  window.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  update();
}

// --- sound toggle and tap feedback ---------------------------------------------------------

function initSoundToggle(sound: Sound) {
  const btn = document.querySelector<HTMLButtonElement>("[data-sound]");
  if (!btn) return;
  btn.hidden = false;
  const show = () => {
    btn.setAttribute("aria-pressed", String(sound.on));
    btn.querySelector("[data-sound-label]")!.textContent = sound.on ? "Sound on" : "Sound off";
  };
  btn.addEventListener("click", () => {
    sound.toggle();
    show();
    sound.tap();
  });
  // Returning visitors who chose sound get it back on their first tap.
  if (soundWasOn()) {
    const resume = () => {
      if (!sound.on) {
        sound.toggle();
        show();
      }
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }
  show();
}

function initTapFeedback(sound: Sound) {
  document.addEventListener("pointerdown", (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(".btn, [data-ripple]");
    if (!el || el.matches("[data-sound]")) return;
    sound.tap();
    if (reduce) return;
    const r = el.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.left = `${e.clientX - r.left}px`;
    dot.style.top = `${e.clientY - r.top}px`;
    el.append(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
  });
}

// --- cursor, tilt and magnetic buttons (fine pointers only) -----------------------------------

function initCursor() {
  const ring = document.createElement("div");
  ring.className = "cursor";
  ring.setAttribute("aria-hidden", "true");
  document.body.append(ring);
  let x = -100;
  let y = -100;
  let cx = x;
  let cy = y;
  window.addEventListener("pointermove", (e) => {
    x = e.clientX;
    y = e.clientY;
    const hot = (e.target as Element | null)?.closest("a, button, [data-tilt]");
    ring.classList.toggle("is-hot", Boolean(hot));
  });
  document.addEventListener("pointerleave", () => ring.classList.add("is-away"));
  document.addEventListener("pointerenter", () => ring.classList.remove("is-away"));
  const tick = () => {
    cx += (x - cx) * 0.2;
    cy += (y - cy) * 0.2;
    ring.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
    requestAnimationFrame(tick);
  };
  tick();
}

function initTilt() {
  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  });
}

function initMagnetic() {
  document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
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
