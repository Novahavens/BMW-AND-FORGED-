/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BRAND } from '../../config/brand';
import { SOCIAL_ICON_PATHS } from '../../config/socialIcons';
import { cx } from './ui';

export const SocialLinks: React.FC<{ className?: string; size?: 'sm' | 'md'; withWebsite?: boolean }> = ({
  className,
  size = 'md',
  withWebsite = false
}) => {
  const links = BRAND.social.filter((s) => withWebsite || s.id !== 'website');
  const box = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11';
  const icon = size === 'sm' ? 'h-[15px] w-[15px]' : 'h-[18px] w-[18px]';
  return (
    <ul className={cx('flex items-center gap-2', className)}>
      {links.map((s) => (
        <li key={s.id}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${BRAND.name} on ${s.label} (${s.handle})`}
            title={`${s.label} ${s.handle}`}
            className={cx(
              'inline-flex items-center justify-center rounded-full ring-1 ring-line text-mute transition-all duration-300 ease-lux hover:text-gold hover:ring-gold/50',
              box
            )}
          >
            <svg viewBox="0 0 24 24" className={icon} fill="currentColor" aria-hidden>
              <path d={SOCIAL_ICON_PATHS[s.id]} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
};
