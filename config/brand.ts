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

export const BRAND = {
  /** Wordmark text, shown when no logo image is set. */
  name: 'FORGED',
  /** Optional logo image (SVG/PNG on a transparent background). Replaces the wordmark when set. */
  logoUrl: '' as string,
  /** Small line under the wordmark on the welcome screen. */
  descriptor: 'Forged wheels for BMW M',
  tagline: 'Precision. Forged.',
  welcomeTitle: 'Welcome to FORGED',
  welcomeBody:
    'Configure forged wheels on your BMW M car. Choose the car, the paint, then the design, size and finish of your wheels, and see it in real time.',
  /** Hosts in the showroom header line. */
  vehicleLine: 'BMW M',

  colors: {
    ink: '#0b0c0e',
    muted: '#6b7079',
    /** Small highlights: active step, prices, focus rings. */
    accent: '#a57c43'
  },

  contact: {
    email: 'hello@forged.example',
    phone: '+44 20 0000 0000',
    website: 'forged.example'
  },

  /** Notice shown before the configurator opens. */
  visualisationNotice:
    'The vehicles in this configurator are pre-curated visualisations. Paint, wheel size and finish are shown as accurately as possible, but on-screen colours and proportions are indicative. Your final specification and fitment are confirmed with our team.',

  regions: [
    { id: 'uk', label: 'United Kingdom', language: 'English', currency: 'GBP', locale: 'en-GB', rate: 0.79 },
    { id: 'us', label: 'United States', language: 'English', currency: 'USD', locale: 'en-US', rate: 1 },
    { id: 'eu', label: 'Europe', language: 'English', currency: 'EUR', locale: 'en-IE', rate: 0.92 },
    { id: 'ae', label: 'United Arab Emirates', language: 'English', currency: 'AED', locale: 'en-AE', rate: 3.67 },
    { id: 'za', label: 'South Africa', language: 'English', currency: 'ZAR', locale: 'en-ZA', rate: 18.2 }
  ] as Region[]
};

export const DEFAULT_REGION = BRAND.regions[0];

export const formatMoney = (usd: number, region: Region) =>
  new Intl.NumberFormat(region.locale, {
    style: 'currency',
    currency: region.currency,
    maximumFractionDigits: 0
  }).format(Math.round((usd * region.rate) / 10) * 10);
