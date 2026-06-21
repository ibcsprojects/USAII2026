import { defineManifest } from '@crxjs/vite-plugin'

// Manifest V3. crxjs reads this and emits dist/manifest.json with hashed asset paths.
export default defineManifest({
  manifest_version: 3,
  name: 'GreenPages — Eco Formatting for Docs',
  version: '0.1.0',
  description:
    'Like Grammarly, but for paper & ink. Flags wasteful print formatting in Google Docs and suggests eco-friendly fixes you accept one at a time.',
  // Pins the extension ID to onaabbhlbchjeddeiecogkbooookdond regardless of which path it's
  // loaded unpacked from. Without this, every moderator's "Load unpacked" gets a different,
  // path-derived ID, and the oauth2.client_id below (registered to one specific ID in Google
  // Cloud Console) would only ever authenticate for whoever that one ID happened to belong
  // to. See README.md "Setup" for the matching Cloud Console step.
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqlYJlEPGSfmL8fgV1/qJb7b7T3oUKRSAFCHCbAw8DqyBog2PnFt8Spz/OxdID50NsCbRu2B2cwaXkRVn8fo6BZYX8/WjeSRh8Bos4GnJplBD0VnXDDo4TkOfgVIAPQxX6GwA0AMQM+Q1gUYZlEnFUqu5TtVQzTcslcArQu22YHwsbiNafo5cnRfnWTMyT4fIVcyjR8IE7mZ+xO6ZHmfd/sxuAY14LK8K8+uT6MZ+90PNDu07bowsmhorZky/bjO1OKWpaXTlK3M7kn0GhoF956GbBmmeo0oV4UpInBDo2msYRgvHdYah1ce0Tp99hto/r05wkqOK7YazDgTg+oY+GQIDAQAB',
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  action: {
    default_title: 'Open GreenPages',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  oauth2: {
     client_id: '607806555304-5fqrvu6f75121qj69p68h1aositrhp8s.apps.googleusercontent.com',
     // documents: read/write the doc. drive.readonly: export the doc to PDF so we can count
     // its real rendered pages (the Docs API exposes no page count).
     scopes: [
       'https://www.googleapis.com/auth/documents',
       'https://www.googleapis.com/auth/drive.readonly',
     ],
   },
  content_scripts: [
    {
      matches: ['https://docs.google.com/document/*'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['sidePanel', 'storage', 'scripting', 'activeTab', 'identity'],
  host_permissions: ['https://docs.google.com/*'],
})
   