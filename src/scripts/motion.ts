/**
 * Scroll reveals for [data-reveal]. Skipped entirely under reduced motion and
 * when IntersectionObserver is missing, so content is never left hidden.
 * Hero entrance motion is pure CSS (styles/motion.css).
 */
export function initMotion(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (items.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-revealed");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
  );
  // Elements already on screen reveal immediately, so there is no flash on load.
  const fold = window.innerHeight;
  items.forEach((el) => {
    if (el.getBoundingClientRect().top < fold) el.classList.add("is-revealed");
    else io.observe(el);
  });
  document.documentElement.classList.add("reveal-ready");
  const motif = document.documentElement.dataset.motif;
  if (motif === "aurum" || motif === "horology") initCountUp();
}

/**
 * Aurum motif: numerals in [data-count] count up from zero when they scroll into
 * view, keeping the decimals of the final value. The final text is in the HTML,
 * so search engines and no-JS visitors always see the real number.
 */
function initCountUp(): void {
  const els = document.querySelectorAll<HTMLElement>("[data-count]");
  const run = (el: HTMLElement) => {
    const target = el.dataset.count ?? "";
    const end = Number(target);
    if (!Number.isFinite(end)) return;
    const decimals = target.includes(".") ? target.split(".")[1]!.length : 0;
    const start = performance.now();
    const dur = 1600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = t < 1 ? (end * eased).toFixed(decimals) : target;
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
  els.forEach((el) => io.observe(el));
}
