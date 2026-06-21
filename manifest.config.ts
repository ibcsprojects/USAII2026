import { defineManifest } from '@crxjs/vite-plugin'

// Manifest V3. crxjs reads this and emits dist/manifest.json with hashed asset paths.
export default defineManifest({
  manifest_version: 3,
  name: 'GreenPages — Eco Formatting for Docs',
  version: '0.1.0',
  description:
    'Like Grammarly, but for paper & ink. Flags wasteful print formatting in Google Docs and suggests eco-friendly fixes you accept one at a time.',
  // Pins the extension ID to kjbciphieolicifkgflhnpepckkbchip regardless of which path
  // it's loaded unpacked from — required for the oauth2.client_id below (registered
  // against this exact ID in Google Cloud Console) to actually authenticate.
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsWKB+6u84kBg2xjkv4/3/gIcE4gaaoRC3BXYlOf4XF+43BadywOG0a170EobqpCI8BV/ojf6MiYl/PrY4/qO96c9qQr3xYJDDYWOoSxLMO0GesY9v0A6icP3zbrP2AiX/EOF3ZLiW4RNYlY6xsswDfKKsbQnvDEiQELTb6uPVpocCpQZnHytPuSS9JfO0MgBBTBP6j0axxvCl1hwb3hmmByLsIHtXr1mg8G8Pxw54izr5MZ7797tIHZLjEtjQnUUgtUkVSB1enN3wu4njSPDZwG6cx1FBDsmCgi0mIoDGq7G/NVAQb2AKL923WhmOn1p3VJBHXDVcQqhZFy5JAFHKwIDAQAB',
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
    client_id: '1016658682661-gmvr4ihpodcmgoh89on11l1asq1a6d26.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/documents'],
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
   