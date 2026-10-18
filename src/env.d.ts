/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Public CRM lead-capture endpoint. Ships to the browser: never a private key. */
  readonly PUBLIC_CRM_LEAD_URL?: string;
  /** "1" for temporary preview hosting: noindex everywhere, preview banner, simulated form submits. */
  readonly PUBLIC_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
