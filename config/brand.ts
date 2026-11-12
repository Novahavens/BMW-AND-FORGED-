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
  /** The same wordmark as a vector (traced from the PNG): sharp at any size on screen. The PDF still embeds the PNG. */
  logoSvgUrl: '/brand/forgedsa-wordmark.svg' as string,
  /** Small line under the wordmark on the welcome screen. */
  descriptor: 'Forged wheels for BMW M',
  tagline: 'Precision. Forged.',
  welcomeTitle: 'Welcome to FORGEDSA',
  welcomeBody:
    'Configure forged wheels on your BMW M car. Choose the car, the paint, then the design, size and finish of your wheels, and see it in real time.',

  /** Brand kit palette (FORGEDSA Official Brand Design System). The Tailwind theme in index.html mirrors it. */
  colors: {
    gold: '#CF9F52', // Forged Gold: primary
    brass: '#E8C37D', // Brass Light: highlight
    carbon: '#121212', // Matte Carbon: background
    gunmetal: '#2A2A2A', // Gunmetal: surface
    ember: '#FF5A00' // Electric Orange: main action buttons only (site, PDF, lead email)
  },

  // Phone and email are the owner's (2026-11-12). The email is the FORGEDSA inbox that also receives the new-lead emails.
  contact: {
    email: 'forgedsa1@gmail.com',
    phone: '+27 82 000 0000',
    website: 'www.forgedsa.com'
  },

  social: [
    { id: 'instagram', label: 'Instagram', handle: '@ForgedSA', url: 'https://www.instagram.com/forgedsa' },
    { id: 'tiktok', label: 'TikTok', handle: '@ForgedSA', url: 'https://www.tiktok.com/@forgedsa' },
    { id: 'youtube', label: 'YouTube', handle: '/ForgedSA', url: 'https://www.youtube.com/@ForgedSA' },
    { id: 'website', label: 'Website', handle: 'www.forgedsa.com', url: 'https://www.forgedsa.com' }
  ] as SocialLink[],

  /**
   * What the business stands behind, in the owner's words (PDF spec sheet; usable on any page). `short` is the
   * compact form for a four-up strip: a label, a headline and an optional second line. `full` is the sentence.
   * Do not add terms here that the owner has not given (certificate numbers, periods, exclusions).
   */
  credentials: [
    { id: 'dealer', label: 'SIXNINE', headline: 'Only dealer', detail: 'in South Africa', full: 'The only SIXNINE dealer in South Africa' },
    { id: 'tuv', label: 'Certification', headline: 'TÜV certified', detail: '', full: 'TÜV certified' },
    { id: 'finish', label: 'Finish', headline: '3-year warranty', detail: 'on the wheel finish', full: '3-year warranty on the finish' },
    { id: 'wheel', label: 'Wheel', headline: 'Lifetime warranty', detail: 'Not for neglect', full: 'Lifetime warranty on the wheel', note: 'Does not cover neglect.' }
  ] as { id: string; label: string; headline: string; detail: string; full: string; note?: string }[],

  /** The visualisation disclaimer, shown on the summary page before the PDF and the enquiry. */
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
