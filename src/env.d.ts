/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Public CRM lead-capture endpoint. Ships to the browser: never a private key. */
  readonly PUBLIC_CRM_LEAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
