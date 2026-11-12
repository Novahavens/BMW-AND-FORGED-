---
name: forgedsa-pdf-brochure
description: Change or debug the customer's two-page FORGEDSA PDF spec sheet, generated in the browser with jsPDF. Covers the email+mobile gate that saves a lead first, embedded Satoshi fonts, logo and social icons, the price-cut-to-"R" bug, and how to render a test PDF headlessly. Use for any change to the brochure layout, content, gate or lead capture.
---

# PDF brochure

## Code map

| Piece | File |
|---|---|
| Gate modal (email + mobile required, name optional, contact remembered) | `components/journey/SummaryPage.tsx` |
| Lead save (`source: 'pdf'`), then the PDF | `App.tsx` → `onDownloadPdf` → `submitEnquiry` then `downloadBrochurePdf` |
| Lead insert and local fallback | `services/journeyService.ts` (`rememberedPdfContact`, `rememberPdfContact`) |
| PDF builder | `services/brochurePdf.ts` |

- **Gate:** mobile is validated as `/^\+?\d{9,15}$/` after stripping spaces and dashes. The lead
  save never blocks the PDF; offline it keeps a local copy.
- Saving the lead triggers the lead email (`forgedsa-lead-email-automation`), so test with QA
  addresses and delete the rows afterwards.

## Builder rules (`brochurePdf.ts`)

- **Layout:** dark A4 pages.
  - Header: logo PNG, then config code, date and page.
  - Page 1: hero image, a spec table and the price box.
  - Page 2: two views, the wheel story, and highlights with gold bullets.
  - Wheel weights print only when greater than 0.
  - "Next steps" has an orange **Open your build online** pill linked to `/?config=CODE`.
- **Credentials:** the four statements the owner gave (only SIXNINE dealer in South Africa, TÜV certified, 3-year
  warranty on the finish, lifetime warranty on the wheel, not for neglect) live in `BRAND.credentials`
  (`config/brand.ts`) and print twice: a four-up strip under the price on page 1 and "Our assurance" cards on page 2.
  Use the owner's words; do not add periods, exclusions, certificate numbers or standards they have not given.
- **Page budget:** page 2 reserves `NEXT_H` and `ASSURANCE_H` from the bottom (footer rule at 268 mm), so a long wheel
  story is clipped rather than run into them. Change those constants with the layout.
- **Pictures:** `placeImage` clips to rounded corners with a hairline frame. The PDF prints `summaryImages`, the same
  three stills as the summary page, and waits up to 30 s for them (`stillsForPdf` in `App.tsx`).
- **Fonts:** Satoshi TTFs (`public/fonts/satoshi-700.ttf`, `-900.ttf`) are embedded. jsPDF can't use
  woff2.
- **Always pass text through `pdfText()`.** It replaces U+00A0, U+202F, U+2007 and U+2009 with plain
  spaces. en-ZA currency formatting uses a narrow no-break space that Satoshi lacks, and without
  this the price printed as just "R".
- **Social icons:** Simple Icons paths (`config/socialIcons.ts`) are drawn to PNG via canvas
  `Path2D` (jsPDF can't draw SVG paths), plus `doc.link`.
- **Character spacing:** jsPDF's `getTextWidth` ignores `setCharSpace`, so size pills manually
  (≈ `textWidth + n × 0.18 + padding` at charSpace 0.5) and check the render.
- **Links:** `window.location.origin` supplies the terms, delivery and reopen URLs.

## Test render

1. Use `.scratch/pdf-test.html` (see `forgedsa-render-verification`). Load it at
   `https://forged-configurator.vercel.app/.scratch/pdf-test.html`, routed to the dev server, so the
   URLs print correctly.
2. Feed it real stills (crops of engine screenshots) through `fetch` → data URL, and wait for the
   `download` event.
3. Render the pages with `pypdfium2` and inspect both pages.
