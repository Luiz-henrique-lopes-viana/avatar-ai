/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TTS_ENDPOINT: string;
  readonly VITE_TTS_API_KEY: string;
  readonly VITE_AVATAR_URL: string;
  readonly VITE_AVATAR_ID: string;
  readonly VITE_AVATAR_BODY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
