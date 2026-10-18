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
}
