/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRAND, Region, formatMoney } from '../config/brand';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../types';

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

const imageSize = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 16, h: 10 });
    img.src = src;
  });

/** Two-page A4 spec sheet, generated in the browser (no server needed). */
export async function downloadBrochurePdf(input: BrochureInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16;
  const ink: [number, number, number] = [11, 12, 14];
  const mute: [number, number, number] = [107, 112, 121];
  const bronze: [number, number, number] = [165, 124, 67];

  const header = (page: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.setCharSpace(2.2);
    doc.text(BRAND.name, M, 16);
    doc.setCharSpace(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...mute);
    doc.text(`Configuration ${input.code}  ·  ${new Date().toLocaleDateString(input.region.locale)}  ·  ${page}/2`, W - M, 16, { align: 'right' });
    doc.setDrawColor(225, 227, 231);
    doc.line(M, 20, W - M, 20);
  };

  const footer = () => {
    doc.setFontSize(7.5);
    doc.setTextColor(...mute);
    doc.text(`${BRAND.contact.email}  ·  ${BRAND.contact.phone}  ·  ${BRAND.contact.website}`, M, 287);
    doc.text('Visualisation only. Final specification and fitment are confirmed with our team.', W - M, 287, { align: 'right' });
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...bronze);
  doc.setCharSpace(1.2);
  doc.text(BRAND.descriptor.toUpperCase(), M, 32);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...ink);
  doc.text(`Your ${input.car.name}`, M, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...mute);
  doc.text(`${input.paint.name}  ·  ${input.wheel.name}  ·  ${input.size}  ·  ${input.finish.name}`, M, 51);

  const heroH = await placeImage(input.images[0], M, 58, W - 2 * M, 110);
  let y = 58 + heroH + 10;

  const rows: [string, string, string][] = [
    ['Vehicle', input.car.name, `${input.car.chassisCode} · ${input.car.power}`],
    ['Paint', input.paint.name, `${input.paint.type} · ${input.paint.code}`],
    ['Wheel design', input.wheel.name, `${input.wheel.code} · ${input.wheel.style}`],
    ['Wheel size', input.size, `Front ${input.car.recommendedWheelFitment.front} · Rear ${input.car.recommendedWheelFitment.rear}`],
    ['Wheel finish', input.finish.name, input.finish.colorName]
  ];
  rows.forEach(([k, v, d]) => {
    doc.setDrawColor(232, 234, 237);
    doc.line(M, y - 5, W - M, y - 5);
    doc.setFontSize(7.5);
    doc.setTextColor(...mute);
    doc.setCharSpace(0.8);
    doc.text(k.toUpperCase(), M, y);
    doc.setCharSpace(0);
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.text(v, 62, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...mute);
    doc.text(d, W - M, y, { align: 'right' });
    y += 11;
  });

  doc.setFillColor(...ink);
  doc.roundedRect(M, y, W - 2 * M, 20, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setCharSpace(1);
  doc.text('WHEEL SET OF FOUR', M + 7, y + 12);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(formatMoney(input.price, input.region), W - M - 7, y + 13, { align: 'right' });
  footer();

  // Page 2: views + wheel story
  doc.addPage();
  header(2);
  const half = (W - 2 * M - 6) / 2;
  const h1 = await placeImage(input.images[1], M, 28, half, 70);
  const h2 = await placeImage(input.images[2], M + half + 6, 28, half, 70);
  y = 28 + Math.max(h1, h2) + 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...ink);
  doc.text(input.wheel.name, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...mute);
  doc.text(input.wheel.subtitle, M, y + 7);
  const desc = doc.splitTextToSize(input.wheel.description, W - 2 * M);
  doc.setTextColor(...ink);
  doc.text(desc, M, y + 17);
  y += 17 + desc.length * 5 + 6;
  input.wheel.highlights.forEach((h) => {
    doc.setFillColor(...bronze);
    doc.circle(M + 1, y - 1.2, 0.8, 'F');
    doc.text(h, M + 5, y);
    y += 6.5;
  });
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...mute);
  doc.text(
    `Weight: ${input.wheel.weightFrontKg} kg front / ${input.wheel.weightRearKg} kg rear  ·  ${input.wheel.weightSavingsKg} kg lighter per corner`,
    M,
    y
  );
  y += 14;
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text(`Open this configuration again at ${window.location.origin}/?config=${input.code}`, M, y);
  footer();

  doc.save(`${BRAND.name.toLowerCase()}-${input.car.id}-${input.code}.pdf`);
}
