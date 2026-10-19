/// <reference types="vite/client" />

interface EaRuntimeConfig {
  entraTenantId?: string;
  entraClientId?: string;
  entraApiScope?: string;
}

interface Window {
  /** Installation settings from /config.js (see frontend/docker/40-ea-config.sh). */
  __EA_CONFIG__?: EaRuntimeConfig;
}
