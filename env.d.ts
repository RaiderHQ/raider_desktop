/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RAIDER_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
