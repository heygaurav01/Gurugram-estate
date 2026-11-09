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

  if (panel && timeline) {
    panel.addEventListener(
      "scroll",
      () => {
        const pr = panel.getBoundingClientRect();
        const tr = timeline.getBoundingClientRect();
        const p = clamp((pr.bottom - tr.top - pr.height * 0.3) / tr.height);
        timeline.style.setProperty("--line", p.toFixed(3));
      },
      { passive: true },
    );
  }
}
