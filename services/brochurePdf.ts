/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { jsPDF as JsPDF } from 'jspdf';
import { BRAND, Region, formatMoney } from '../config/brand';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../types';
import { SOCIAL_ICON_PATHS } from '../config/socialIcons';

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
    doc.text(`Configuration ${input.code}  ·  ${new Date().toLocaleDateString(input.region.locale)}  ·  ${page}/2`, W - M, 15.5, { align: 'right' });
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

  const placeImage = async (src: string | undefined, x: number, y: number, w: number, maxH: number) => {
    if (!src) return 0;
    const { w: iw, h: ih } = await imageSize(src);
    const h = Math.min(maxH, (w * ih) / iw);
    const drawW = (h * iw) / ih;
    doc.addImage(src, 'JPEG', x + (w - drawW) / 2, y, drawW, h, undefined, 'FAST');
    return h;
  };

  // Page 1: hero + options
  header(1);
  body(true);
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);
  doc.setCharSpace(1.4);
  doc.text(BRAND.descriptor.toUpperCase(), M, 33);
  doc.setCharSpace(0);
  heading('black');
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text(`Your ${input.car.name}`, M, 45);
  body();
  doc.setFontSize(10);
  doc.setTextColor(...MUTE);
  doc.text(`${input.paint.name}  ·  ${input.wheel.name}  ·  ${input.size}  ·  ${input.finish.name}`, M, 52);

  const heroH = await placeImage(input.images[0], M, 58, W - 2 * M, 104);
  let y = 58 + heroH + 11;

  const fit = input.car.recommendedWheelFitment;
  // Blank specs (cars listed without them) leave the detail column empty rather than "Front  · Rear "
  const rows: [string, string, string][] = [
    ['Vehicle', input.car.name, [input.car.chassisCode, input.car.power].filter((v) => v?.trim()).join(' · ')],
    ['Paint', input.paint.name, `${input.paint.type} · ${input.paint.code}`],
    ['Wheel design', input.wheel.name, [input.wheel.code, input.wheel.style].filter((v) => v?.trim()).join(' · ')],
    [
      'Wheel size',
      input.size,
      [fit?.front && `Front ${fit.front}`, fit?.rear && `Rear ${fit.rear}`].filter(Boolean).join(' · ')
    ],
    ['Wheel finish', input.finish.name, input.finish.colorName]
  ];
  rows.forEach(([k, v, d]) => {
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
    body();
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    if (d) doc.text(d, W - M, y, { align: 'right' });
    y += 11;
  });

  doc.setFillColor(...GUNMETAL);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W - 2 * M, 20, 3, 3, 'FD');
  body(true);
  doc.setTextColor(...MUTE);
  doc.setFontSize(7.5);
  doc.setCharSpace(1.2);
  doc.text('WHEEL SET OF FOUR', M + 7, y + 12);
  doc.setCharSpace(0);
  heading('black');
  doc.setFontSize(17);
  doc.setTextColor(...GOLD);
  doc.text(pdfText(formatMoney(input.price, input.region)), W - M - 7, y + 13, { align: 'right' });
  footer();

  // Page 2: views + wheel story
  doc.addPage();
  header(2);
  const half = (W - 2 * M - 6) / 2;
  const h1 = await placeImage(input.images[1], M, 29, half, 70);
  const h2 = await placeImage(input.images[2], M + half + 6, 29, half, 70);
  y = 29 + Math.max(h1, h2) + 15;
  body(true);
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);
  doc.setCharSpace(1.4);
  doc.text((input.wheel.code || 'THE WHEEL').toUpperCase(), M, y - 7);
  doc.setCharSpace(0);
  heading('black');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(input.wheel.name, M, y);
  body();
  doc.setFontSize(10);
  doc.setTextColor(...MUTE);
  doc.text(input.wheel.subtitle, M, y + 7);
  const desc = doc.splitTextToSize(input.wheel.description, W - 2 * M);
  doc.setTextColor(...INK);
  doc.text(desc, M, y + 17);
  y += 17 + desc.length * 5 + 6;
  input.wheel.highlights.forEach((h) => {
    doc.setFillColor(...GOLD);
    doc.circle(M + 1, y - 1.2, 0.8, 'F');
    doc.setTextColor(...INK);
    doc.text(h, M + 5, y);
    y += 6.5;
  });
  // Weights only when the wheel has them (the catalogue leaves them 0 until measured)
  if (input.wheel.weightFrontKg > 0 || input.wheel.weightRearKg > 0) {
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    const saving = input.wheel.weightSavingsKg > 0 ? `  ·  ${input.wheel.weightSavingsKg} kg lighter per corner` : '';
    doc.text(`Weight: ${input.wheel.weightFrontKg} kg front / ${input.wheel.weightRearKg} kg rear${saving}`, M, y);
  }
  y += 14;

  // Next steps
  doc.setFillColor(...GUNMETAL);
  doc.roundedRect(M, y, W - 2 * M, 42, 3, 3, 'F');
  heading('bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('Next steps', M + 7, y + 10);
  body();
  doc.setFontSize(9);
  doc.setTextColor(...MUTE);
  doc.text(
    doc.splitTextToSize(
      'Send us this configuration to confirm fitment for your car. We reply with a written quotation, lead time and delivery or fitment options. Every set is forged and finished to order.',
      W - 2 * M - 14
    ),
    M + 7,
    y + 17
  );
  // Call to action: Electric Orange pill (the brand's action colour), linked to the saved build
  const reopen = `${origin}/?config=${input.code}`;
  const cta = 'OPEN YOUR BUILD ONLINE';
  heading('bold');
  doc.setFontSize(8);
  doc.setCharSpace(0.5);
  const ctaW = doc.getTextWidth(cta) + cta.length * 0.18 + 14;
  doc.setFillColor(...EMBER);
  doc.roundedRect(M + 7, y + 26, ctaW, 10, 5, 5, 'F');
  doc.setTextColor(...CARBON);
  doc.text(cta, M + 14, y + 32.4);
  doc.setCharSpace(0);
  doc.link(M + 7, y + 26, ctaW, 10, { url: reopen });
  body();
  doc.setFontSize(8);
  doc.setTextColor(...MUTE);
  doc.text(reopen, M + 7 + ctaW + 5, y + 32.2);
  doc.link(M + 7 + ctaW + 5, y + 28.5, doc.getTextWidth(reopen), 5, { url: reopen });
  footer();

  doc.save(`${BRAND.name.toLowerCase()}-${input.car.id}-${input.code}.pdf`);
}
