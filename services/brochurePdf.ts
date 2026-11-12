/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { jsPDF as JsPDF } from 'jspdf';
import { BRAND, Region, formatMoney } from '../config/brand';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../types';
import { SOCIAL_ICON_PATHS } from '../config/socialIcons';
import { finishSurcharge } from './pricing';

export interface BrochureInput {
  car: CarModel;
  paint: PaintColor;
  wheel: WheelDesign;
  finish: WheelFinish;
  size: string;
  price: number;
  region: Region;
  code: string;
  /** JPEG data URLs: [front three-quarter, side, wheel close-up] */
  images: string[];
}

type RGB = [number, number, number];
const hexRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Brand kit palette
const CARBON = hexRgb(BRAND.colors.carbon);
const GUNMETAL = hexRgb(BRAND.colors.gunmetal);
const GOLD = hexRgb(BRAND.colors.gold);
const EMBER = hexRgb(BRAND.colors.ember);
const INK: RGB = [242, 238, 230];
const MUTE: RGB = [156, 151, 142];
const HAIRLINE: RGB = [46, 46, 46];
const FRAME: RGB = [74, 66, 52]; // a gold-tinted hairline for picture frames and cards
const IMG_RADIUS = 2.5;
// Page 2 reserves these from the bottom (the footer rule is at 268 mm), so the wheel story is cut rather than run into them
const NEXT_H = 38; // the "Next steps" box
const ASSURANCE_H = 4 + 2 * 15 + 4; // the "Our assurance" block: its label, two rows of cards and the gap between

// Locale formatting (e.g. en-ZA "R 86 000") uses no-break and narrow spaces; the embedded Satoshi font has
// no glyphs for them and jsPDF drops the rest of the string, so they become plain spaces.
const pdfText = (s: string) => s.replace(/[\u00a0\u202f\u2007\u2009]/g, ' ');

const imageSize = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 16, h: 10 });
    img.src = src;
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

async function fetchDataUrl(url: string) {
  try {
    const res = await fetch(url);
    return res.ok ? await blobToDataUrl(await res.blob()) : null;
  } catch {
    return null;
  }
}

/** Embeds Satoshi (the brand heading face) from /public/fonts; falls back to Helvetica if it can't load. */
async function loadBrandFonts(doc: JsPDF) {
  const load = async (file: string, style: string) => {
    const res = await fetch(`/fonts/${file}`);
    if (!res.ok) throw new Error(file);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    doc.addFileToVFS(file, btoa(bin));
    doc.addFont(file, 'Satoshi', style);
  };
  try {
    await Promise.all([load('satoshi-700.ttf', 'bold'), load('satoshi-900.ttf', 'black')]);
    return true;
  } catch {
    return false;
  }
}

/** Social glyphs drawn to PNG in the brand gold (jsPDF can't draw SVG paths directly). */
function iconPng(path: string, px = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.scale(px / 24, px / 24);
  ctx.fillStyle = BRAND.colors.gold;
  ctx.fill(new Path2D(path));
  return c.toDataURL('image/png');
}

/** Two-page A4 spec sheet in the FORGEDSA dark style, generated in the browser (no server needed). */
export async function downloadBrochurePdf(input: BrochureInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16;
  const [hasSatoshi, logo] = await Promise.all([loadBrandFonts(doc), fetchDataUrl(BRAND.logoUrl)]);
  const logoSize = logo ? await imageSize(logo) : null;
  const heading = (weight: 'bold' | 'black') => (hasSatoshi ? doc.setFont('Satoshi', weight) : doc.setFont('helvetica', 'bold'));
  const body = (bold = false) => doc.setFont('helvetica', bold ? 'bold' : 'normal');
  const icons = BRAND.social.map((s) => ({ ...s, png: iconPng(SOCIAL_ICON_PATHS[s.id]) }));
  const origin = window.location.origin;

  const background = () => {
    doc.setFillColor(...CARBON);
    doc.rect(0, 0, W, H, 'F');
  };

  const header = (page: number) => {
    background();
    if (logo && logoSize) {
      const h = 5.2;
      doc.addImage(logo, 'PNG', M, 11, (h * logoSize.w) / logoSize.h, h, undefined, 'FAST');
    } else {
      heading('black');
      doc.setFontSize(12);
      doc.setTextColor(...GOLD);
      doc.text(BRAND.name, M, 16);
    }
    body();
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    doc.text(pdfText(`Configuration ${input.code}  ·  ${new Date().toLocaleDateString(input.region.locale)}  ·  ${page}/2`), W - M, 15.5, { align: 'right' });
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(M, 21, W - M, 21);
  };

  const footer = () => {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(M, 268, W - M, 268);
    // Social channels: gold glyph + handle, each a link
    let x = M;
    body();
    doc.setFontSize(8);
    icons.forEach((s) => {
      if (s.png) doc.addImage(s.png, 'PNG', x, 272.2, 3.6, 3.6, undefined, 'FAST');
      doc.setTextColor(...INK);
      doc.text(s.handle, x + 5, 275);
      const w = 5 + doc.getTextWidth(s.handle);
      doc.link(x, 271.5, w, 5, { url: s.url });
      x += w + 7;
    });
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTE);
    doc.text(`${BRAND.contact.email}  ·  ${BRAND.contact.phone}`, M, 283);
    doc.link(M, 280, doc.getTextWidth(BRAND.contact.email), 4, { url: `mailto:${BRAND.contact.email}` });
    doc.text('Visualisation only. Final specification, fitment and price are confirmed with our team.', W - M, 283, { align: 'right' });
    doc.text(`Terms: ${origin}/terms  ·  Delivery & fitment: ${origin}/delivery`, M, 288);
  };

  // A picture with softly rounded corners and a hairline frame: the stills carry the studio backdrop, which is a
  // shade off the page's carbon, so the frame makes it read as a deliberate panel
  const placeImage = async (src: string | undefined, x: number, y: number, w: number, maxH: number) => {
    if (!src) return 0;
    const { w: iw, h: ih } = await imageSize(src);
    const h = Math.min(maxH, (w * ih) / iw);
    const drawW = (h * iw) / ih;
    const dx = x + (w - drawW) / 2;
    doc.saveGraphicsState();
    doc.roundedRect(dx, y, drawW, h, IMG_RADIUS, IMG_RADIUS, null);
    doc.clip();
    doc.discardPath();
    doc.addImage(src, 'JPEG', dx, y, drawW, h, undefined, 'FAST');
    doc.restoreGraphicsState();
    doc.setDrawColor(...FRAME);
    doc.setLineWidth(0.25);
    doc.roundedRect(dx, y, drawW, h, IMG_RADIUS, IMG_RADIUS, 'S');
    return h;
  };

  /** Small gold letter-spaced label (section eyebrows, card labels). */
  const eyebrow = (text: string, x: number, y: number, size = 7.5, space = 1.4, align?: 'right') => {
    body(true);
    doc.setFontSize(size);
    doc.setTextColor(...GOLD);
    doc.setCharSpace(space);
    doc.text(text.toUpperCase(), x, y, align ? { align } : undefined);
    doc.setCharSpace(0);
  };

  // Page 1: hero + options
  header(1);
  eyebrow(BRAND.descriptor, M, 33);
  heading('black');
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text(`Your ${input.car.name}`, M, 45);
  body();
  doc.setFontSize(10);
  doc.setTextColor(...MUTE);
  doc.text(`${input.paint.name}  ·  ${input.wheel.name}  ·  ${input.size}  ·  ${input.finish.name}`, M, 52);

  const heroH = await placeImage(input.images[0], M, 58, W - 2 * M, 101);
  let y = 58 + heroH + 11;

  const money = (usd: number) => pdfText(formatMoney(usd, input.region));
  // The wheel's own fitment from the stock sheet (its "PCD 5×112 · ET8/15 · CB 66.6" highlight) wins over the
  // car's recommended fitment: the factory sizes and offsets must not print beside a wheel that states its own
  const fit = input.car.recommendedWheelFitment;
  const wheelFitment =
    input.wheel.highlights.find((h) => /\bPCD\b/i.test(h)) ||
    [fit?.front && `Front ${fit.front}`, fit?.rear && `Rear ${fit.rear}`].filter(Boolean).join(' · ');
  // The size row carries the base-finish set price and the finish row what the finish adds (input.price is
  // finish-inclusive), so the two line items add up to the total box, as on the summary page
  const surcharge = finishSurcharge(input.wheel, input.size, input.finish.id);
  // Blank specs (cars listed without them) leave the detail column empty rather than "Front  · Rear "
  const rows: [string, string, string, string?][] = [
    ['Vehicle', input.car.name, [input.car.chassisCode, input.car.power].filter((v) => v?.trim()).join(' · ')],
    ['Paint', input.paint.name, `${input.paint.type} · ${input.paint.code}`],
    ['Wheel design', input.wheel.name, [input.wheel.code, input.wheel.style].filter((v) => v?.trim()).join(' · ')],
    ['Wheel size', input.size, pdfText(wheelFitment), money(Math.max(0, input.price - surcharge))],
    ['Wheel finish', input.finish.name, input.finish.colorName, surcharge > 0 ? `+${money(surcharge)}` : undefined]
  ];
  rows.forEach(([k, v, d, price]) => {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(M, y - 5, W - M, y - 5);
    body();
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTE);
    doc.setCharSpace(0.8);
    doc.text(k.toUpperCase(), M, y);
    doc.setCharSpace(0);
    heading('bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(v, 62, y);
    // Price (when the row has one) sits at the right edge; the detail text is right-aligned before it
    let right = W - M;
    if (price) {
      heading('bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(price, right, y, { align: 'right' });
      right -= doc.getTextWidth(price) + 4;
    }
    body();
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    if (d) doc.text(d, right, y, { align: 'right' });
    y += 9.8;
  });

  doc.setFillColor(...GUNMETAL);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W - 2 * M, 18, 3, 3, 'FD');
  body(true);
  doc.setTextColor(...MUTE);
  doc.setFontSize(7.5);
  doc.setCharSpace(1.2);
  doc.text('WHEEL SET OF FOUR', M + 7, y + 11);
  doc.setCharSpace(0);
  heading('black');
  doc.setFontSize(17);
  doc.setTextColor(...GOLD);
  doc.text(pdfText(formatMoney(input.price, input.region)), W - M - 7, y + 12, { align: 'right' });

  // What we stand behind, four across (config/brand.ts credentials): the owner's words, nothing added
  y += 18 + 8;
  const gap = 3;
  const cardW = (W - 2 * M - gap * (BRAND.credentials.length - 1)) / BRAND.credentials.length;
  BRAND.credentials.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    doc.setDrawColor(...FRAME);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, cardW, 17, 2.5, 2.5, 'S');
    eyebrow(c.label, x + 4, y + 5.6, 6.2, 0.9);
    heading('bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(c.headline, x + 4, y + 10.8);
    if (c.detail) {
      body();
      doc.setFontSize(7.2);
      doc.setTextColor(...MUTE);
      doc.text(c.detail, x + 4, y + 14.6);
    }
  });
  footer();

  // Page 2: views + wheel story
  doc.addPage();
  header(2);
  const half = (W - 2 * M - 6) / 2;
  const h1 = await placeImage(input.images[1], M, 29, half, 70);
  const h2 = await placeImage(input.images[2], M + half + 6, 29, half, 70);
  const imgBottom = 29 + Math.max(h1, h2);
  body();
  doc.setFontSize(7);
  doc.setTextColor(...MUTE);
  doc.setCharSpace(0.9);
  if (h1) doc.text('SIDE PROFILE', M, imgBottom + 4.6);
  if (h2) doc.text('WHEEL DETAIL', M + half + 6, imgBottom + 4.6);
  doc.setCharSpace(0);
  y = imgBottom + 19;
  eyebrow(input.wheel.code || 'THE WHEEL', M, y - 7);
  heading('black');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(input.wheel.name, M, y);
  // The wheel story is bounded: the "Next steps" box (42 mm), its gap (14 mm) and the weight line (4 mm) stay
  // above the footer rule at 268 mm, so free text from /admin is wrapped and cut rather than run off the page
  const textW = W - 2 * M;
  const LINE = 5;
  const hasWeight = input.wheel.weightFrontKg > 0 || input.wheel.weightRearKg > 0;
  const storyLimit = 266 - NEXT_H - 10 - ASSURANCE_H - 10 - (hasWeight ? 4 : 0);
  const wrap = (s: string, width: number) => doc.splitTextToSize(pdfText(s), width) as string[];
  // Keeps the first `max` lines; the last one loses words until the ellipsis fits the width
  const clip = (lines: string[], max: number, width: number) => {
    if (lines.length <= max) return lines;
    let last = lines[Math.max(0, max - 1)];
    while (last && doc.getTextWidth(`${last}…`) > width) last = last.replace(/\s*\S+$/, '');
    return [...lines.slice(0, Math.max(0, max - 1)), `${last}…`];
  };
  body();
  doc.setFontSize(10);
  doc.setTextColor(...MUTE);
  const subtitle = wrap(input.wheel.subtitle, textW);
  doc.text(subtitle, M, y + 7);
  y += 7 + (subtitle.length - 1) * LINE + 10;
  doc.setTextColor(...INK);
  // The stock sheet's "In stock for the M3 Sedan (G80): PCD ..." sentence is about the owner's inventory, not this
  // build (it read "In stock for the M3" under an M2 CS); the fitment is already in the size row and the bullets
  const blurb = input.wheel.description.replace(/\s*In stock for .*$/i, '').trim() || input.wheel.description;
  const desc = clip(wrap(blurb, textW), Math.max(1, Math.floor((storyLimit - y - 6) / LINE)), textW);
  doc.text(desc, M, y);
  y += desc.length * LINE + 6;
  for (const h of input.wheel.highlights) {
    const lines = wrap(h, textW - 5);
    const height = (lines.length - 1) * LINE + 6.5;
    if (y + height > storyLimit) break;
    doc.setFillColor(...GOLD);
    doc.circle(M + 1, y - 1.2, 0.8, 'F');
    doc.setTextColor(...INK);
    doc.text(lines, M + 5, y);
    y += height;
  }
  // Weights only when the wheel has them (the catalogue leaves them 0 until measured)
  if (hasWeight) {
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    const saving = input.wheel.weightSavingsKg > 0 ? `  ·  ${input.wheel.weightSavingsKg} kg lighter per corner` : '';
    doc.text(`Weight: ${input.wheel.weightFrontKg} kg front / ${input.wheel.weightRearKg} kg rear${saving}`, M, y);
  }
  y += 10;

  // Our assurance: the same four statements in full sentences, with the exclusion the owner gave stated
  eyebrow('Our assurance', M, y);
  y += 4;
  const colW = (W - 2 * M - 4) / 2;
  const cardH = 15;
  BRAND.credentials.forEach((c, i) => {
    const x = M + (i % 2) * (colW + 4);
    const cy = y + Math.floor(i / 2) * (cardH + 4);
    doc.setFillColor(...GUNMETAL);
    doc.roundedRect(x, cy, colW, cardH, 2.5, 2.5, 'F');
    // gold tick in a ring
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.35);
    doc.circle(x + 7, cy + cardH / 2, 2.9, 'S');
    doc.lines([[1.1, 1.2], [1.9, -2.4]], x + 5.6, cy + cardH / 2 + 0.1, [1, 1], 'S');
    heading('bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const head = doc.splitTextToSize(pdfText(c.full), colW - 18) as string[];
    const top = cy + cardH / 2 - (head.length - 1) * 2.2 + (c.note ? -1.2 : 1.2);
    doc.text(head, x + 14, top);
    if (c.note) {
      body();
      doc.setFontSize(7.8);
      doc.setTextColor(...MUTE);
      doc.text(c.note, x + 14, top + (head.length - 1) * 4.4 + 4.6);
    }
  });
  y += 2 * cardH + 4 + 10;

  // Next steps
  doc.setFillColor(...GUNMETAL);
  doc.roundedRect(M, y, W - 2 * M, NEXT_H, 3, 3, 'F');
  heading('bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('Next steps', M + 7, y + 9);
  body();
  doc.setFontSize(9);
  doc.setTextColor(...MUTE);
  doc.text(
    doc.splitTextToSize(
      'Send us this configuration to confirm fitment for your car. We reply with a written quotation, lead time and delivery or fitment options. Every set is forged and finished to order.',
      W - 2 * M - 14
    ),
    M + 7,
    y + 15.5
  );
  // Call to action: Electric Orange pill (the brand's action colour), linked to the saved build
  const reopen = `${origin}/?config=${input.code}`;
  const cta = 'OPEN YOUR BUILD ONLINE';
  heading('bold');
  doc.setFontSize(8);
  doc.setCharSpace(0.5);
  const ctaW = doc.getTextWidth(cta) + cta.length * 0.18 + 14;
  doc.setFillColor(...EMBER);
  doc.roundedRect(M + 7, y + 25, ctaW, 9, 4.5, 4.5, 'F');
  doc.setTextColor(...CARBON);
  doc.text(cta, M + 14, y + 30.7);
  doc.setCharSpace(0);
  doc.link(M + 7, y + 25, ctaW, 9, { url: reopen });
  body();
  doc.setFontSize(8);
  doc.setTextColor(...MUTE);
  doc.text(reopen, M + 7 + ctaW + 5, y + 30.5);
  doc.link(M + 7 + ctaW + 5, y + 27, doc.getTextWidth(reopen), 5, { url: reopen });
  footer();

  doc.save(`${BRAND.name.toLowerCase()}-${input.car.id}-${input.code}.pdf`);
}
