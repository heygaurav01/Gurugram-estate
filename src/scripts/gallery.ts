/** Lightbox for Gallery.astro. Progressive enhancement over plain image links. */
export function initGallery(): void {
  const dialog = document.querySelector<HTMLDialogElement>("[data-lightbox]");
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-gallery-item]"));
  if (!dialog || links.length === 0) return;

  const img = dialog.querySelector<HTMLImageElement>("[data-lightbox-img]")!;
  const caption = dialog.querySelector<HTMLElement>("[data-lightbox-caption]")!;
  const count = dialog.querySelector<HTMLElement>("[data-lightbox-count]")!;
  let index = 0;
  let opener: HTMLElement | null = null;

  const show = (i: number) => {
    index = (i + links.length) % links.length;
    const link = links[index]!;
    img.src = link.dataset.full ?? link.href;
    img.alt = link.dataset.alt ?? "";
    caption.textContent = link.dataset.caption ?? "";
    count.textContent = `${index + 1} of ${links.length}`;
  };

  links.forEach((link, i) =>
    link.addEventListener("click", (e) => {
      e.preventDefault();
      opener = link;
      show(i);
      dialog.showModal();
    }),
  );
  dialog.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => show(index - 1));
  dialog.querySelector("[data-lightbox-next]")?.addEventListener("click", () => show(index + 1));
  dialog.querySelector("[data-lightbox-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });
  dialog.addEventListener("close", () => opener?.focus());
}
