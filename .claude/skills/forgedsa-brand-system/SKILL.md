---
name: forgedsa-brand-system
description: Apply or change the FORGEDSA brand across the site, PDF brochure, lead email and handover documents. Covers colour roles (Electric Orange for main actions, Forged Gold for everything else that stands out), Satoshi and Inter, the wordmark, social links, and every place brand tokens are duplicated. Use for any colour, font, logo, contact or social change, or when building a new branded surface.
---

# FORGEDSA brand system

## Tokens and roles

| Token | Hex | Role |
|---|---|---|
| Matte Carbon | #121212 | page backgrounds (`carbon`, `studio`) |
| Surface | #1A1A1A | cards, sheets (`surface`) |
| Gunmetal | #2A2A2A | raised surfaces, lines (`gunmetal`) |
| Forged Gold | #CF9F52 | logo, selected options, active steps, prices, headings (`gold`) |
| Brass Light | #E8C37D | hovers on gold (`brass`) |
| Electric Orange | #FF5A00 | **main action buttons only** (`ember`, hover `ember-light` #FF7A33, glow `shadow-ember`) |
| Ink / Mute | #F2EEE6 / #9C978E | text / secondary text |

- Orange marks "the next step". These are the primary `Button` variant in
  `components/journey/ui.tsx`: Enter, Build, Confirm, View your build, Download PDF, Send enquiry,
  Configure.
  - Don't use orange for selections, tabs or progress bars; those stay gold.
  - Text on orange is Carbon, never white (contrast).
- **Type:** Satoshi (display, 500/700/900) and Inter (body), self-hosted in `public/fonts/`.
  `index.css` was deleted because it forced Verdana.

## Where tokens live (change all of them together)

1. `config/brand.ts`: name, `logoUrl`, colours, contact (placeholders: `info@forgedsa.com`, `+27 00 000 0000`),
   `social` links, regions and rates. Social icon paths are in `config/socialIcons.ts`.
2. `index.html`: the Tailwind CDN config (`colors`, `boxShadow`), `@font-face`, favicons, meta.
3. `services/brochurePdf.ts`: reads `BRAND.colors` and embeds `satoshi-700/900.ttf`.
4. `n8n/lead-email.code.js` and the live n8n Code node: hard-coded copies.
5. `docs/handover/handover.html`: CSS variables for the branded handover PDF.
6. `docs/CLIENT_HANDOVER.md` §3 describes the colour roles for the client.

## Assets

- **Wordmark:** `public/brand/forgedsa-wordmark.png` (about 9.5:1). It was cut out of a supplied
  image whose checkerboard was printed in, not real transparency.
  - Keep logo heights small in headers: sm `h-3.5`, md `h-4 sm:h-5`, lg `h-6 sm:h-8`.
- **Favicon:** a temporary gold "F" until the hexagon monogram arrives.
- **Social:** Instagram @ForgedSA, TikTok @ForgedSA, YouTube /ForgedSA, www.forgedsa.com. They appear
  on the welcome screen, menu, `components/SiteFooter.tsx` and the PDF.

## Checklist for a new branded surface

Dark Carbon base, gold for headings and emphasis, one orange primary action, Satoshi headings and
Inter body, the wordmark top-left, and the social and contact footer. Render and check it at phone
width (390 px).
