/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { Logo, cx } from './ui';
import { SocialLinks } from './SocialLinks';

export interface MenuLink {
  label: string;
  onClick: () => void;
}

/** Minimal header: menu, centred wordmark, two actions. */
export const TopBar: React.FC<{
  links: MenuLink[];
  onLogo: () => void;
  actions?: React.ReactNode;
  className?: string;
}> = ({ links, onLogo, actions, className }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className={cx('absolute top-0 inset-x-0 z-40 flex items-center justify-between px-4 sm:px-8 h-16 sm:h-20', className)}>
        <button
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="flex h-10 items-center gap-3 rounded-full pl-2 pr-3 text-ink hover:bg-ink/[0.05] transition"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
          <span className="hidden sm:inline text-[10.5px] font-semibold uppercase tracking-[0.24em]">Menu</span>
        </button>
        <button onClick={onLogo} className="absolute left-1/2 -translate-x-1/2" aria-label={`${BRAND.name} home`}>
          <Logo />
        </button>
        <div className="flex items-center gap-2">{actions}</div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[75]">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade" onClick={() => setOpen(false)} />
          <nav className="absolute inset-y-0 left-0 w-full max-w-sm bg-surface shadow-panel flex flex-col animate-slide-in">
            <div className="flex items-center justify-between h-16 sm:h-20 px-6">
              <Logo size="sm" />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-ink/[0.05]">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto px-6 pt-6">
              {links.map((l, i) => (
                <li key={l.label} className="animate-rise" style={{ animationDelay: `${60 + i * 50}ms` }}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      l.onClick();
                    }}
                    className="group flex w-full items-center justify-between border-b border-line py-5 font-display text-[19px] font-bold tracking-[-0.01em] text-ink"
                  >
                    {l.label}
                    <ArrowUpRight className="h-4 w-4 text-mute transition group-hover:text-ink group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-6 pb-8 text-[12px] leading-relaxed text-mute">
              <SocialLinks size="sm" withWebsite className="mb-5" />
              <div>{BRAND.contact.email}</div>
              <div>{BRAND.contact.phone}</div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
};
