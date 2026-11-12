/**
 * Sends the site's own analytics events to the Meta Pixel (loaded in BaseLayout
 * when settings.analytics.meta_pixel_id is set). Payloads never contain personal
 * data: only intent, project slug and an opaque event id.
 *
 *   gp:generate_lead           -> Lead (eventID = idempotency key, for later
 *                                 de-duplication with the Conversions API)
 *   gp:form_open               -> custom FormOpen
 *   gp:cta_click               -> custom EnquireClick
 *   [data-track] call/WhatsApp -> Contact
 */
type Fbq = (...args: unknown[]) => void;
type Detail = { intent?: string; project?: string; projectName?: string; eventId?: string };

function fbq(...args: unknown[]): void {
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  if (typeof f === "function") f(...args);
}

export function initTracking(): void {
  const on = (name: string, handler: (d: Detail) => void) =>
    window.addEventListener(`gp:${name}`, (e) =>
      handler(((e as CustomEvent).detail ?? {}) as Detail),
    );

  on("generate_lead", (d) =>
    fbq(
      "track",
      "Lead",
      {
        content_name: d.projectName ?? d.project ?? "General enquiry",
        content_category: d.intent ?? "general",
      },
      d.eventId ? { eventID: d.eventId } : undefined,
    ),
  );
  on("form_open", (d) => fbq("trackCustom", "FormOpen", { content_category: d.intent ?? "" }));
  on("cta_click", (d) => fbq("trackCustom", "EnquireClick", { content_category: d.intent ?? "" }));

  document.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
    const kind = el?.dataset.track;
    if (kind === "call_click" || kind === "whatsapp_click") {
      fbq("track", "Contact", { content_category: kind === "call_click" ? "call" : "whatsapp" });
    }
  });
}
