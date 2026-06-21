/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the deployed backend (e.g. https://your-app.vercel.app).
   * Baked in at build time so AI condensation works without any user setup.
   */
  readonly VITE_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
