/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Publishable (browser-safe) credentials; writes are gated by row-level security.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qxlfkfhzpqbxffuqqewg.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_K6StjjlsyguXl4EUOsGk9w_nkmbTUQj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const ASSET_BUCKETS = {
  carModels: 'car-models',
  rimImages: 'rim-images',
  rimModels: 'rim-models',
} as const;
