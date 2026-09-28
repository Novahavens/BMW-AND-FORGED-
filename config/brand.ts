/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Everything brand-specific lives here: swap the name, logo, colours, copy and regions in this one
 * file and the whole configurator follows.
 */

export interface Region {
  id: string;
  label: string;
  language: string;
  currency: string;
  locale: string;
  /** Multiplier from the catalogue's USD prices. */
  rate: number;
}

export interface SocialLink {
  id: 'instagram' | 'tiktok' | 'youtube' | 'website';
  label: string;
  handle: string;
  url: string;
}

export const BRAND = {
  /** Brand name (alt text, PDF, file names); shown as text when no logo image is set. */
  name: 'FORGEDSA',
  /** Logo image on a transparent background (the gold wordmark). Replaces the text when set. */
  logoUrl: '/brand/forgedsa-wordmark.png' as string,
  /** Small line under the wordmark on the welcome screen. */
  descriptor: 'Forged wheels for BMW M',
  tagline: 'Precision. Forged.',
  welcomeTitle: 'Welcome to FORGEDSA',
  welcomeBody:
    'Configure forged wheels on your BMW M car. Choose the car, the paint, then the design, size and finish of your wheels, and see it in real time.',
  /** Hosts in the showroom header line. */
  vehicleLine: 'BMW M',

  /** Brand kit palette (FORGEDSA Official Brand Design System). The Tailwind theme in index.html mirrors it. */
  colors: {
    gold: '#CF9F52', // Forged Gold: primary
    brass: '#E8C37D', // Brass Light: highlight
    carbon: '#121212', // Matte Carbon: background
    gunmetal: '#2A2A2A', // Gunmetal: surface
    ember: '#FF5A00' // Electric Orange: main action buttons only (site, PDF, lead email)
  },

  // Placeholder email and phone: replace with the real ones before launch.
  contact: {
    email: 'info@forgedsa.com',
    phone: '+27 00 000 0000',
    website: 'www.forgedsa.com'
  },

  social: [
    { id: 'instagram', label: 'Instagram', handle: '@ForgedSA', url: 'https://www.instagram.com/forgedsa' },
    { id: 'tiktok', label: 'TikTok', handle: '@ForgedSA', url: 'https://www.tiktok.com/@forgedsa' },
    { id: 'youtube', label: 'YouTube', handle: '/ForgedSA', url: 'https://www.youtube.com/@ForgedSA' },
    { id: 'website', label: 'Website', handle: 'www.forgedsa.com', url: 'https://www.forgedsa.com' }
  ] as SocialLink[],

  /** Notice shown before the configurator opens. */
  visualisationNotice:
    'The vehicles in this configurator are pre-curated visualisations. Paint, wheel size and finish are shown as accurately as possible, but on-screen colours and proportions are indicative. Your final specification and fitment are confirmed with our team.',

  regions: [
    { id: 'za', label: 'South Africa', language: 'English', currency: 'ZAR', locale: 'en-ZA', rate: 18.2 },
    { id: 'uk', label: 'United Kingdom', language: 'English', currency: 'GBP', locale: 'en-GB', rate: 0.79 },
    { id: 'us', label: 'United States', language: 'English', currency: 'USD', locale: 'en-US', rate: 1 },
    { id: 'eu', label: 'Europe', language: 'English', currency: 'EUR', locale: 'en-IE', rate: 0.92 },
    { id: 'ae', label: 'United Arab Emirates', language: 'English', currency: 'AED', locale: 'en-AE', rate: 3.67 }
  ] as Region[]
};

export const DEFAULT_REGION = BRAND.regions[0];

export const formatMoney = (usd: number, region: Region) =>
  new Intl.NumberFormat(region.locale, {
    style: 'currency',
    currency: region.currency,
    maximumFractionDigits: 0
  }).format(Math.round((usd * region.rate) / 10) * 10);
