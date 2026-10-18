/**
 * Pointer-driven 3D tilt for the hub "Coming Soon" scene, with spring-like
 * smoothing (Framer-style). Fine pointers only; off under reduced motion.
 */
export function initComingSoon(): void {
  const root = document.querySelector<HTMLElement>("[data-cs]");
  const scene = root?.querySelector<HTMLElement>("[data-cs-scene]");
  if (!root || !scene) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const MAX_X = 10; // degrees around the X axis
  const MAX_Y = 14; // degrees around the Y axis
  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let raf = 0;

  // Damped spring: stiffness and damping tuned for a soft, settled feel.
  const STIFFNESS = 0.08;
  const DAMPING = 0.78;

  const step = () => {
    vx = (vx + (targetX - x) * STIFFNESS) * DAMPING;
    vy = (vy + (targetY - y) * STIFFNESS) * DAMPING;
    x += vx;
    y += vy;
    scene.style.setProperty("--rx", `${x.toFixed(3)}deg`);
    scene.style.setProperty("--ry", `${y.toFixed(3)}deg`);
    const settled =
      Math.abs(targetX - x) < 0.01 &&
      Math.abs(targetY - y) < 0.01 &&
      Math.abs(vx) < 0.01 &&
      Math.abs(vy) < 0.01;
    raf = settled ? 0 : requestAnimationFrame(step);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(step);
  };

  root.addEventListener("pointermove", (e) => {
    const r = root.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    targetY = px * MAX_Y * 2;
    targetX = -py * MAX_X * 2;
    kick();
  });
  root.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
    kick();
  });
}
