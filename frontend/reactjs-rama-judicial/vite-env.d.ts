/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_ENVIRONMENT: string;
  readonly VITE_TTS_ENDPOINT: string;
  readonly VITE_TTS_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
