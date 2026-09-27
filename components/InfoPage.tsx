/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { BRAND } from '../config/brand';
import { InfoPageContent, LEGAL_DRAFT, PAGES_UPDATED } from '../config/pages';
import { Button, Eyebrow, Logo } from './journey/ui';
import { SiteFooter } from './SiteFooter';

/** Long-form page (terms, delivery): the copy lives in config/pages.ts. */
export const InfoPage: React.FC<{ content: InfoPageContent; onBack: () => void; onEnquire: () => void }> = ({
  content,
  onBack,
  onEnquire
}) => (
  <div className="absolute inset-0 overflow-y-auto bg-carbon text-ink select-text">
    <header className="sticky top-0 z-20 flex h-16 sm:h-20 items-center justify-between bg-carbon/85 backdrop-blur-xl px-4 sm:px-8 border-b border-line">
      <Button variant="ghost" size="sm" onClick={onBack} className="pl-2">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> Back
      </Button>
      <div className="absolute left-1/2 -translate-x-1/2">
        <Logo size="sm" />
      </div>
      <Button variant="secondary" size="sm" onClick={onEnquire}>
        Enquire
      </Button>
    </header>

    <section className="bg-studio border-b border-line">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 pt-14 sm:pt-20 pb-12 sm:pb-16">
        <Eyebrow className="text-gold animate-rise">{content.eyebrow}</Eyebrow>
        <h1 className="mt-4 font-display text-[36px] sm:text-[56px] font-black leading-[1.0] tracking-[-0.035em] animate-rise delay-100">
          {content.title}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-mute animate-rise delay-200">{content.intro}</p>
        <div className="mt-6 text-[11.5px] uppercase tracking-[0.18em] text-mute">Last updated {PAGES_UPDATED}</div>
        {LEGAL_DRAFT && (
          <div className="mt-6 rounded-2xl ring-1 ring-gold/30 bg-gold/[0.06] px-4 py-3 text-[12.5px] leading-relaxed text-ink/80">
            Draft for review. Details in [brackets] are being finalised; contact us at {BRAND.contact.email} with any questions.
          </div>
        )}
      </div>
    </section>

    <article className="mx-auto max-w-3xl px-5 sm:px-8 py-12 sm:py-16 space-y-10">
      {content.sections.map((s) => (
        <section key={s.title}>
          <h2 className="font-display text-[20px] sm:text-[22px] font-bold tracking-[-0.01em]">{s.title}</h2>
          {s.body?.map((p, i) => (
            <p key={i} className="mt-3 text-[14.5px] leading-[1.75] text-ink/80">
              {p}
            </p>
          ))}
          {s.points && (
            <ul className="mt-4 space-y-2.5">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-3 text-[14.5px] leading-[1.7] text-ink/80">
                  <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>

    <SiteFooter />
  </div>
);
