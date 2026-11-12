/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BRAND } from '../config/brand';
import { linkTo } from '../services/nav';
import { Logo, cx } from './journey/ui';
import { SocialLinks } from './journey/SocialLinks';

const LINKS = [
  { label: 'The wheels', path: '/forged' },
  { label: 'Configure', path: '/configure' },
  { label: 'Delivery & fitment', path: '/delivery' },
  { label: 'Terms & conditions', path: '/terms' },
  { label: 'Credits', path: '/credits' }
];

/** Footer for the scrolling pages: brand, social channels, info links and contact. */
export const SiteFooter: React.FC<{ className?: string }> = ({ className }) => (
  <footer className={cx('border-t border-line bg-carbon', className)}>
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-14 grid gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
      <div>
        <Logo size="sm" />
        <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-mute">{BRAND.tagline} Forged wheels for BMW M, made to order in South Africa.</p>
        <SocialLinks className="mt-6" withWebsite />
      </div>
      <nav aria-label="Footer">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-gold">Explore</div>
        <ul className="mt-4 space-y-2.5 text-[13.5px]">
          {LINKS.map((l) => (
            <li key={l.path}>
              <a href={l.path} onClick={linkTo(l.path)} className="text-ink/80 hover:text-gold transition-colors">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-gold">Contact</div>
        <ul className="mt-4 space-y-2.5 text-[13.5px] text-ink/80">
          <li>
            <a href={`mailto:${BRAND.contact.email}`} className="hover:text-gold transition-colors">
              {BRAND.contact.email}
            </a>
          </li>
          <li>
            <a href={`tel:${BRAND.contact.phone.replace(/\s+/g, '')}`} className="hover:text-gold transition-colors">
              {BRAND.contact.phone}
            </a>
          </li>
          {BRAND.social.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">
                {s.label} <span className="text-mute">{s.handle}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
    <div className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 flex flex-col sm:flex-row gap-2 justify-between text-[11.5px] text-mute">
        <span>
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </span>
        <span>BMW and M are trademarks of BMW AG. {BRAND.name} is an independent wheel brand.</span>
      </div>
    </div>
  </footer>
);
