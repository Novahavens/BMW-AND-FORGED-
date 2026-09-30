---
name: forgedsa-handover-docs
description: Write or update FORGEDSA handover documentation. Covers the plain-language client handover (Markdown), the branded 12-page client PDF built from HTML with Chromium, the technical handover and the README. Includes the print-CSS tricks for dark pages, page headers and footers, sharp logos and no orphaned headings. Use after any feature change that clients or developers need to know about, or when regenerating the branded PDF.
---

# Handover documentation

## Documents and audiences

| File | Audience | Keep in sync when… |
|---|---|---|
| `docs/CLIENT_HANDOVER.md` | non-technical owner | features, journey, admin tasks, outstanding work, costs |
| `docs/FORGEDSA-Client-Handover.pdf` (source `docs/handover/handover.html`) | the client, emailed | the client handover changes |
| `docs/HANDOVER.md` | developer | setup, assets, deploy, automations (§5a lead email) |
| `docs/WHEEL_PIPELINE.md` | developer/operator | wheel pipeline or sheet changes |
| `README.md` | anyone opening the repo | stack, admin, catalogue, layout |
| `docs/SKILLS.md` + `.claude/skills/*` | Claude Code / developers | a process changes |

**Client writing style:**
- Plain language, tables for "what / why", no code.
- Always keep an **Outstanding work** section near the front. It currently lists wheel fidelity,
  vehicle rendering fidelity, and the Terms/Delivery accuracy and legal check.
- Remove any personal email you don't want the client copy to show.

## Building the branded PDF

```bash
ln -s /opt/node22/lib/node_modules/playwright node_modules/playwright   # sandbox only; remove after
node scripts/build-handover-pdf.mjs      # → docs/FORGEDSA-Client-Handover.pdf
rm node_modules/playwright
```

What made it work in Chromium's print:
- `@page { size: A4; margin: 22mm 18mm 20mm; background: #121212 }` paints the dark margins.
  Put `print-color-adjust: exact` on `html` and `body`.
- **Margin boxes:** `@top-left`, `@bottom-right { content: counter(page, decimal-leading-zero) }` and
  so on give the headers and footers.
- **Full-bleed cover:** a named page, `@page cover { margin: 0 }` with `.cover { page: cover }`.
- **Header logo:**
  - An `@top-left { content: url(img/logo-header.svg) }` image **must also appear in the document**
    (a 1px hidden `<img>`), or it never loads and nothing shows.
  - Wrap a high-resolution PNG in an SVG with fixed width and height to control the printed size.
    A raw PNG prints at its pixel size.
- **No orphaned headings:** `.num, h2, h3 { break-after: avoid }`, `break-before: avoid` on what
  follows, and `break-inside: avoid` on cards.
  - If a heading still strands, start that section on a new page (`section` has
    `break-before: page`; `.flow` sections continue on the same page).
- **Floats, not grids,** for image-beside-text blocks that may span pages. Chromium won't split
  grid rows.

## Screenshots for docs

Capture fresh app screenshots with the journey script (`forgedsa-render-verification`). Route
Supabase storage through curl, or the wheels render as blank discs. Crop in full-size
coordinates.

After rebuilding, render every page with `pypdfium2` and view them as a contact sheet before
committing.
