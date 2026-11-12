// n8n Code node "Build branded email" in the workflow "FORGEDSA · Lead email (PDF downloads + enquiries)".
// Source of truth is the node in n8n; this copy is kept in the repo for review and restore.
// Input: the JSON body posted by the Supabase trigger private.notify_lead_webhook() (first created in supabase/migrations/20260928090000_lead_email_webhook.sql; current body in 20261110153000_wheel_inventory_stock_sheet.sql).
const lead = $input.first().json.body || {};
const SITE = 'https://forged-configurator.vercel.app';
const REGIONS = {
  za: { label: 'South Africa', currency: 'ZAR', locale: 'en-ZA', rate: 18.2 },
  uk: { label: 'United Kingdom', currency: 'GBP', locale: 'en-GB', rate: 0.79 },
  us: { label: 'United States', currency: 'USD', locale: 'en-US', rate: 1 },
  eu: { label: 'Europe', currency: 'EUR', locale: 'en-IE', rate: 0.92 },
  ae: { label: 'United Arab Emirates', currency: 'AED', locale: 'en-AE', rate: 3.67 }
};
const region = REGIONS[lead.region] || REGIONS.za;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
const money = (usd) => {
  if (!(Number(usd) > 0)) return null;
  const n = Math.round((Number(usd) * region.rate) / 10) * 10;
  return new Intl.NumberFormat(region.locale, { style: 'currency', currency: region.currency, maximumFractionDigits: 0 }).format(n).replace(/[  ]/g, ' ');
};

const isPdf = lead.source === 'pdf';
const kind = isPdf ? 'PDF brochure download' : 'Enquiry';
const who = (lead.name || '').trim() || lead.email || 'Unknown';
const car = lead.car || {};
const paint = lead.paint || {};
const wheel = lead.wheel || {};
const finish = lead.finish || {};
const carName = car.name || '—';
const price = money(wheel.price_usd);
const code = lead.config_code || '';
const buildUrl = code ? `${SITE}/?config=${encodeURIComponent(code)}` : SITE;
const phoneHref = String(lead.phone || '').replace(/[^\d+]/g, '');
const received = new Date(lead.created_at || Date.now()).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

const GOLD = '#CF9F52', EMBER = '#FF5A00', INK = '#F2EEE6', MUTE = '#9C978E', LINE = '#2A2A2A', CARD = '#1A1A1A', BG = '#121212';
const font = "font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;";
const label = (t) => `<div style="${font}font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:${MUTE};font-weight:600;">${t}</div>`;
const swatch = (c) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle;"><tr><td width="22" height="22" style="width:22px;height:22px;border-radius:11px;background-color:${c};border:1px solid #3a3a3a;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
const row = (k, v, extra = '') => `<tr>
  <td style="padding:14px 0;border-bottom:1px solid ${LINE};width:38%;vertical-align:middle;">${label(k)}</td>
  <td style="padding:14px 0;border-bottom:1px solid ${LINE};vertical-align:middle;${font}font-size:15px;color:${INK};">${extra}${extra ? '&nbsp;&nbsp;' : ''}<span style="vertical-align:middle;">${v}</span></td>
</tr>`;
const contactRow = (k, v) => `<tr><td style="padding:6px 0;width:30%;">${label(k)}</td><td style="padding:6px 0;${font}font-size:15px;color:${INK};">${v}</td></tr>`;
const button = (href, text, primary) => `<a class="btn" href="${href}" style="display:inline-block;${font}font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 26px;margin:0 8px 10px 0;border-radius:999px;${primary ? `background-color:${EMBER};color:${BG};` : `border:1px solid #444;color:${INK};`}">${text}</a>`;

const specRows = [
  row('Vehicle', `${esc(carName)}${car.generation ? ` <span style="color:${MUTE};">· ${esc(car.generation)}</span>` : ''}`),
  row('Paint', `${esc(paint.name || '—')}${paint.type ? ` <span style="color:${MUTE};">· ${esc(paint.type)}</span>` : ''}`, paint.hex ? swatch(hex(paint.hex, '#555555')) : ''),
  row('Wheel', `${esc(wheel.name || '—')}${wheel.code ? ` <span style="color:${MUTE};">· ${esc(wheel.code)}</span>` : ''}`),
  row('Size', esc(lead.size || '—')),
  row('Finish', `${esc(finish.name || '—')}${finish.color_name && finish.color_name !== finish.name ? ` <span style="color:${MUTE};">· ${esc(finish.color_name)}</span>` : ''}`, finish.hex ? swatch(hex(finish.hex, '#555555')) : ''),
  row('Region', esc(region.label))
].join('');

// Stocked wheels have site-relative image_url values (/rim-images/*.webp); an email has no origin, so prefix the production site.
// This repo copy is not deployed automatically: the live n8n Code node must be updated by hand to match (update_workflow + publish_workflow).
const wheelImgSrc = String(wheel.image_url || '').startsWith('/') ? SITE + wheel.image_url : wheel.image_url;
const wheelImg = wheelImgSrc
  ? `<tr><td align="center" style="padding:8px 32px 0;"><img src="${esc(wheelImgSrc)}" width="220" alt="${esc(wheel.name || 'Wheel')}" style="display:block;width:220px;max-width:60%;height:auto;border:0;"></td></tr>`
  : '';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(kind)} · ${esc(who)}</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">${esc(who)} · ${esc(carName)} · ${esc(paint.name || '')} · ${esc(wheel.name || '')} ${esc(lead.size || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
  <tr><td align="center" style="padding:8px 0 28px;"><img src="${SITE}/brand/forgedsa-wordmark.png" width="190" alt="FORGEDSA" style="display:block;width:190px;height:auto;border:0;"></td></tr>
  <tr><td style="background-color:${CARD};border-radius:20px;border:1px solid ${LINE};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:4px;background-color:${GOLD};border-radius:20px 20px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:32px 32px 8px;">
        <div style="${font}font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};font-weight:700;">New lead · ${esc(kind)}</div>
        <div style="${font}font-size:28px;line-height:34px;color:${INK};font-weight:800;padding-top:10px;">${esc(who)}</div>
        <div style="${font}font-size:14px;line-height:21px;color:${MUTE};padding-top:6px;">${isPdf ? 'Downloaded the PDF brochure for this build.' : 'Sent an enquiry about this build.'}${lead.consultation ? ` <span style="color:${GOLD};font-weight:600;">Wants a consultation.</span>` : ''}<br>${esc(received)} (SAST)</div>
      </td></tr>
      <tr><td style="padding:20px 32px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};border-radius:14px;"><tr><td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${lead.name ? contactRow('Name', esc(lead.name)) : ''}
            ${contactRow('Email', `<a href="mailto:${esc(lead.email)}" style="color:${INK};text-decoration:none;">${esc(lead.email || '—')}</a>`)}
            ${contactRow('Mobile', lead.phone ? `<a href="tel:${esc(phoneHref)}" style="color:${INK};text-decoration:none;">${esc(lead.phone)}</a>` : '—')}
          </table>
        </td></tr></table>
      </td></tr>
      ${lead.message ? `<tr><td style="padding:16px 32px 0;">${label('Message')}<div style="${font}font-size:15px;line-height:23px;color:${INK};padding-top:8px;white-space:pre-wrap;">${esc(lead.message)}</div></td></tr>` : ''}
      <tr><td style="padding:28px 32px 0;"><div style="${font}font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};font-weight:700;">Their build</div></td></tr>
      ${wheelImg}
      <tr><td style="padding:8px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${specRows}</table></td></tr>
      <tr><td style="padding:22px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:bottom;">${label('Wheel set price')}<div style="${font}font-size:26px;color:${INK};font-weight:800;padding-top:6px;">${price ? esc(price) : 'On request'}</div></td>
          <td align="right" style="vertical-align:bottom;">${code ? `${label('Build code')}<div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:15px;color:${GOLD};padding-top:6px;letter-spacing:1px;">${esc(code)}</div>` : ''}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px 32px 32px;">
        ${lead.email ? button(`mailto:${esc(lead.email)}?subject=${encodeURIComponent('Your FORGEDSA build')}`, `Reply to ${esc(((lead.name || '').trim().split(/\s+/)[0]) || 'lead')}`, true) : ''}
        ${button(esc(buildUrl), 'Open their build', false)}
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 16px 8px;${font}font-size:12px;line-height:19px;color:${MUTE};">
    Every lead is also saved in the <a href="${SITE}/admin" style="color:${GOLD};text-decoration:none;">FORGEDSA admin</a> under Enquiries.<br>
    Sent automatically by the FORGEDSA configurator.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

const subject = `${isPdf ? 'New PDF download' : 'New enquiry'}: ${who}${carName !== '—' ? ` · ${carName}` : ''}`;
return [{ json: { subject, html, replyTo: lead.email || '' } }];
