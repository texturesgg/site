/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ASSETS_URL: string;
  readonly VITE_ENABLE_EMAIL_PASSWORD_AUTH?: string;
  /** Pairs with the API's TURNSTILE_SECRET; set both or neither. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** The meeting point whose queues Explore shows; meet.textures.gg unless set. */
  readonly VITE_MEET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
