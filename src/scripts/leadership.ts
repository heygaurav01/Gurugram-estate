/**
 * Homepage leadership section: scroll-linked name marquee and portrait reveal,
 * pointer-driven floating badges and cursor bubble, count-up numbers, and the
 * full-screen profile pop-up that opens as a circle from the click point.
 * Under reduced motion the pop-up still works, without animation.
 */

const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function initLeadership(): void {
  const section = document.querySelector<HTMLElement>("[data-ld]");
  const dialog = document.querySelector<HTMLDialogElement>("[data-ld-pop]");
  if (!section) return;
  if (dialog) initPopup(dialog);
  if (reduce()) return;

  section.classList.add("ld--motion");
  const rows = Array.from(section.querySelectorAll<HTMLElement>("[data-ld-row]"));
  const visual = section.querySelector<HTMLElement>("[data-ld-visual]");

  // Reveal copy and badges once the section is on screen.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        e.target.querySelectorAll<HTMLElement>("[data-ld-count]").forEach(countUp);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.25 },
  );
  section.querySelectorAll("[data-ld-in]").forEach((el) => io.observe(el));

  // Scroll-linked marquee and portrait reveal.
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = clamp((vh - r.top) / (vh + r.height));
    rows.forEach((row, i) => {
      const dir = i % 2 ? 1 : -1;
      row.style.transform = `translate3d(${(dir * (p - 0.5) * 38).toFixed(2)}vw,0,0)`;
    });
    section.style.setProperty("--reveal", clamp((p - 0.12) / 0.3).toFixed(3));
    section.style.setProperty("--drift", ((p - 0.5) * -60).toFixed(1));
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

  if (visual && fine()) initPointer(visual);
  if (fine()) initMagnetic(section);
}

function countUp(el: HTMLElement): void {
  const target = el.dataset.ldCount ?? "";
  const end = Number(target);
  if (!Number.isFinite(end)) return;
  const from = end > 1000 ? end - 30 : 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 1500);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = t < 1 ? String(Math.round(from + (end - from) * eased)) : target;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Badges float toward the pointer at different depths; a bubble trails the cursor. */
function initPointer(visual: HTMLElement): void {
  const bubble = visual.querySelector<HTMLElement>("[data-ld-bubble]");
  let tx = 0,
    ty = 0,
    bx = 0,
    by = 0,
    mx = 0,
    my = 0,
    raf = 0,
    inside = false;
  const loop = () => {
    bx += (tx - bx) * 0.18;
    by += (ty - by) * 0.18;
    if (bubble) bubble.style.transform = `translate3d(${bx.toFixed(1)}px,${by.toFixed(1)}px,0)`;
    visual.style.setProperty("--mx", mx.toFixed(3));
    visual.style.setProperty("--my", my.toFixed(3));
    raf = inside || Math.abs(tx - bx) > 0.5 ? requestAnimationFrame(loop) : 0;
  };
  visual.addEventListener("pointermove", (e) => {
    const r = visual.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
    if (!raf) raf = requestAnimationFrame(loop);
  });
  visual.addEventListener("pointerenter", (e) => {
    const r = visual.getBoundingClientRect();
    bx = tx = e.clientX - r.left;
    by = ty = e.clientY - r.top;
    inside = true;
    visual.classList.add("is-hover");
    if (!raf) raf = requestAnimationFrame(loop);
  });
  visual.addEventListener("pointerleave", () => {
    inside = false;
    mx = my = 0;
    visual.classList.remove("is-hover");
  });
}

function initMagnetic(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-ld-magnetic]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--bx", `${(((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(1)}px`);
      el.style.setProperty("--by", `${(((e.clientY - r.top) / r.height - 0.5) * 10).toFixed(1)}px`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--bx", "0px");
      el.style.setProperty("--by", "0px");
    });
  });
}

/** Full-screen profile: grows as a circle from the click point, shrinks back on close. */
function initPopup(dialog: HTMLDialogElement): void {
  const panel = dialog.querySelector<HTMLElement>("[data-ld-panel]");
  const timeline = dialog.querySelector<HTMLElement>("[data-ld-timeline]");
  let closing = false;

  const open = (e: MouseEvent) => {
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    dialog.style.setProperty("--ox", `${x}px`);
    dialog.style.setProperty("--oy", `${y}px`);
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    if (panel) panel.scrollTop = 0;
    requestAnimationFrame(() => dialog.classList.add("is-open"));
  };
  const finish = () => {
    closing = false;
    dialog.classList.remove("is-open", "is-closing");
    dialog.close();
  };
  const close = () => {
    if (closing || !dialog.open) return;
    if (reduce()) return finish();
    closing = true;
    dialog.classList.add("is-closing");
    window.setTimeout(finish, 650);
  };

  document
    .querySelectorAll<HTMLElement>("[data-ld-open]")
    .forEach((btn) => btn.addEventListener("click", (e) => open(e)));
  dialog.querySelectorAll("[data-ld-close]").forEach((b) => b.addEventListener("click", close));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
  });
  // Links inside (such as "Talk to his team") close the pop-up and then scroll.
  dialog
    .querySelectorAll<HTMLAnchorElement>("a[href^='#']")
    .forEach((a) => a.addEventListener("click", () => finish()));

  initCarousel(dialog);
  if (!panel || reduce()) return;
  dialog.classList.add("ld-pop--motion");

  // Scroll reveals and count-ups inside the pop-up's own scroller.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        e.target.querySelectorAll<HTMLElement>("[data-ld-count]").forEach(countUp);
        if ((e.target as HTMLElement).dataset.ldCount !== undefined)
          countUp(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    },
    { root: panel, threshold: 0.2 },
  );
  dialog.querySelectorAll("[data-pop-reveal]").forEach((el) => io.observe(el));

  // Progress bar, background parallax, word-by-word intro and timeline line.
  const words = Array.from(dialog.querySelectorAll<HTMLElement>("[data-ld-words] [data-w]"));
  const wordsBox = dialog.querySelector<HTMLElement>("[data-ld-words]");
  let ticking = false;
  const update = () => {
    ticking = false;
    if (panel.scrollLeft) panel.scrollLeft = 0;
    const max = panel.scrollHeight - panel.clientHeight;
    dialog.style.setProperty("--pp", (max > 0 ? panel.scrollTop / max : 0).toFixed(4));
    const pr = panel.getBoundingClientRect();
    if (wordsBox) {
      const wr = wordsBox.getBoundingClientRect();
      const p = clamp((pr.bottom - wr.top - pr.height * 0.15) / (wr.height + pr.height * 0.35));
      const lit =
        Math.round(p * words.length * 1.2) + (dialog.classList.contains("is-open") ? 6 : 0);
      words.forEach((w, i) => w.classList.toggle("is-lit", i < lit));
    }
    if (timeline) {
      const tr = timeline.getBoundingClientRect();
      timeline.style.setProperty(
        "--line",
        clamp((pr.bottom - tr.top - pr.height * 0.3) / tr.height).toFixed(3),
      );
    }
  };
  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  panel.addEventListener("scroll", request, { passive: true });
  dialog.addEventListener("transitionend", request);
  new MutationObserver(request).observe(dialog, { attributes: true, attributeFilter: ["class"] });

  if (!fine()) return;
  // 3D portrait: tilts toward the pointer with a moving glare.
  const card = dialog.querySelector<HTMLElement>("[data-ld-tilt]");
  card?.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--ry", `${((x - 0.5) * 18).toFixed(2)}deg`);
    card.style.setProperty("--rx", `${((0.5 - y) * 14).toFixed(2)}deg`);
    card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    card.style.setProperty("--glare", "1");
  });
  card?.addEventListener("pointerleave", () => {
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--glare", "0");
  });
  // Quote card: gold spotlight follows the pointer, with a slight tilt.
  const spot = dialog.querySelector<HTMLElement>("[data-ld-spot]");
  spot?.addEventListener("pointermove", (e) => {
    const r = spot.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    spot.style.setProperty("--sx", `${(x * 100).toFixed(1)}%`);
    spot.style.setProperty("--sy", `${(y * 100).toFixed(1)}%`);
    spot.style.setProperty("--qy", `${((x - 0.5) * 6).toFixed(2)}deg`);
    spot.style.setProperty("--qx", `${((0.5 - y) * 6).toFixed(2)}deg`);
    spot.style.setProperty("--spot", "1");
  });
  spot?.addEventListener("pointerleave", () => {
    spot.style.setProperty("--qx", "0deg");
    spot.style.setProperty("--qy", "0deg");
    spot.style.setProperty("--spot", "0");
  });
}

/** Coverflow carousel: native swipe on touch, drag with a mouse, arrows and dots. */
function initCarousel(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>("[data-ld-track]");
  if (!track) return;
  const cards = Array.from(track.children) as HTMLElement[];
  const dots = Array.from(root.querySelectorAll<HTMLElement>(".ld-car__dots span"));
  const step = () => (cards[0]?.offsetWidth ?? 300) + 19;

  const paint = () => {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let active = 0;
    let best = Infinity;
    cards.forEach((c, i) => {
      const off = (c.offsetLeft + c.offsetWidth / 2 - mid) / c.offsetWidth;
      const o = Math.max(-1, Math.min(1, off));
      if (!reduce()) {
        c.style.setProperty("--off", o.toFixed(3));
        c.style.setProperty("--abs", Math.abs(o).toFixed(3));
      }
      if (Math.abs(off) < best) {
        best = Math.abs(off);
        active = i;
      }
    });
    dots.forEach((d, i) => d.classList.toggle("is-on", i === active));
  };
  track.addEventListener("scroll", () => requestAnimationFrame(paint), { passive: true });
  root
    .querySelector("[data-ld-prev]")
    ?.addEventListener("click", () =>
      track.scrollBy({ left: -step(), behavior: reduce() ? "auto" : "smooth" }),
    );
  root
    .querySelector("[data-ld-next]")
    ?.addEventListener("click", () =>
      track.scrollBy({ left: step(), behavior: reduce() ? "auto" : "smooth" }),
    );

  // Mouse drag (touch already swipes natively).
  let startX = 0;
  let startLeft = 0;
  let dragging = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    dragging = true;
    startX = e.clientX;
    startLeft = track.scrollLeft;
    track.classList.add("is-drag");
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => {
    if (dragging) track.scrollLeft = startLeft - (e.clientX - startX);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("is-drag");
    // Snap to the nearest card once the drag ends.
    const i = Math.round(track.scrollLeft / step());
    track.scrollTo({ left: i * step(), behavior: reduce() ? "auto" : "smooth" });
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  root.addEventListener("transitionend", paint, { once: true });
  new ResizeObserver(paint).observe(track);
}
