/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** 'static' = ignore the Supabase catalogue and show the bundled one (previews before migrations are applied). */
  readonly VITE_CATALOG_SOURCE?: 'static' | 'supabase';
}
