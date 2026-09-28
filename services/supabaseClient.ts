/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Publishable (browser-safe) credentials; writes are gated by row-level security.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qxlfkfhzpqbxffuqqewg.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_K6StjjlsyguXl4EUOsGk9w_nkmbTUQj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * True after the visitor arrived from a "set your password" email: the client reads the link's token as
 * soon as the app loads, before the (lazy) admin page exists, so the signal is caught here.
 */
export const authFlags = {
  passwordRecovery: typeof window !== 'undefined' && /type=recovery/.test(window.location.hash)
};
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') authFlags.passwordRecovery = true;
});

export const ASSET_BUCKETS = {
  carModels: 'car-models',
  rimImages: 'rim-images',
  rimModels: 'rim-models',
} as const;
