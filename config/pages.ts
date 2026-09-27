/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Copy for the Terms & Conditions and Delivery & Fitment pages. Edit the text here; the pages
 * (components/InfoPage.tsx) lay it out.
 *
 * DRAFT: written as a sensible South African starting point (Consumer Protection Act, POPIA), not
 * legal advice. Have an attorney review it, fill in the [bracketed] details, then set
 * `LEGAL_DRAFT` to false to remove the draft notice from both pages.
 */

export const LEGAL_DRAFT = true;
export const PAGES_UPDATED = '27 September 2026';

export interface InfoSection {
  title: string;
  /** Paragraphs. */
  body?: string[];
  /** Bullet points after the paragraphs. */
  points?: string[];
}

export interface InfoPageContent {
  path: '/terms' | '/delivery';
  eyebrow: string;
  title: string;
  intro: string;
  sections: InfoSection[];
}

export const TERMS: InfoPageContent = {
  path: '/terms',
  eyebrow: 'Legal',
  title: 'Terms & conditions',
  intro:
    'These terms apply when you use the FORGEDSA configurator, request a quotation or buy wheels from us. They are written to be read, not skimmed past. Nothing in them limits the rights you have under the Consumer Protection Act 68 of 2008.',
  sections: [
    {
      title: '1. Who we are',
      body: [
        'FORGEDSA ([registered company name], registration number [number], VAT number [number]) is an independent forged wheel brand based in South Africa. References to "we", "us" and "our" mean FORGEDSA; "you" means the person using the configurator or buying from us.'
      ]
    },
    {
      title: '2. The configurator is a visualisation',
      body: [
        'The configurator shows how our wheels could look on your BMW M. Paint colours, wheel finishes, proportions and sizes on screen are as accurate as we can make them, but screens differ and the cars are pre-curated 3D visualisations, not photographs of your vehicle.',
        'Prices shown are indicative, in the currency you selected, and include VAT where applicable. A configuration, a saved code or a PDF is not an order or an offer that binds either of us.'
      ]
    },
    {
      title: '3. Quotations and orders',
      points: [
        'Send an enquiry from the configurator or contact us. We confirm fitment for your exact vehicle (bolt pattern, offset, centre bore, brake clearance and load rating) before quoting.',
        'Our written quotation sets out the final specification, price, lead time and delivery or fitment option. It is valid for 14 days unless it says otherwise.',
        'An order is confirmed when you accept the quotation and we receive your deposit. We send a written order confirmation.'
      ]
    },
    {
      title: '4. Made to order, deposits and payment',
      body: [
        'Our wheels are forged and finished to your specification. Production starts only after we confirm your order.',
        'A deposit of [50]% of the order value is payable to start production. The balance is due before dispatch or fitment. We accept EFT and [other payment methods]; goods remain our property until paid in full.'
      ]
    },
    {
      title: '5. Changes and cancellations',
      points: [
        'Before production starts you may change or cancel your order. We refund your deposit less any reasonable costs already incurred, which we will itemise.',
        'Once production has started the wheels are made specifically for you. If you cancel then, we may keep a reasonable cancellation charge, as allowed by section 17 of the Consumer Protection Act, up to the value of work done and materials committed.',
        'If you ordered in response to direct marketing, you may cancel within five business days of the order or delivery, whichever is later, under section 16 of the Act.'
      ]
    },
    {
      title: '6. Delivery, collection and risk',
      body: [
        'Delivery, collection and fitment options, lead times and what to check when your wheels arrive are set out on our Delivery & fitment page, which forms part of these terms. Risk in the goods passes to you when they are delivered to you or collected.'
      ]
    },
    {
      title: '7. Fitment',
      body: [
        'Forged wheels must be fitted by a qualified technician. We recommend fitment by us or an approved fitment partner, who will balance the wheels, fit or transfer tyre pressure sensors (TPMS) where applicable and torque the wheel bolts to BMW specification. We are not responsible for damage or defects caused by incorrect fitment by others.'
      ]
    },
    {
      title: '8. Quality and warranty',
      body: [
        'Every wheel is inspected before it leaves us. In addition to your rights under the Consumer Protection Act (including the implied six-month warranty of quality), we warrant our wheels against structural defects for [number] years and against finish defects for [number] months from delivery.'
      ],
      points: [
        'The warranty covers defects in materials and workmanship.',
        'It does not cover kerb or impact damage, damage from accidents, incorrect fitment, harsh or acidic cleaning products, abrasive cleaning, modification or repairs by others, or normal wear.',
        'To claim, contact us with your order number, photos and a description. We will repair, replace or refund as the Act provides.'
      ]
    },
    {
      title: '9. Returns',
      body: [
        'Because wheels are made to your specification, we cannot accept returns of wheels that are not defective and match the confirmed order. Defective or incorrectly supplied goods may be returned within six months of delivery for repair, replacement or a refund, in line with section 56 of the Consumer Protection Act.'
      ]
    },
    {
      title: '10. Your information (POPIA)',
      body: [
        'When you send an enquiry or save a configuration we process your name, contact details and the configuration you chose. We use them only to respond to you, prepare your quotation and fulfil your order. We do not sell your information. We store it securely with our service providers and keep it only as long as we need it or the law requires.',
        'You may ask to see, correct or delete your information at any time by emailing [info@forgedsa.com]. Our Information Officer is [name]. You may also complain to the Information Regulator (inforegulator.org.za).'
      ]
    },
    {
      title: '11. Trademarks and content',
      body: [
        'BMW, M and the model names shown are trademarks of BMW AG. FORGEDSA is an independent brand and is not affiliated with or endorsed by BMW AG. Vehicle models in the configurator are 3D visualisations credited to their creators. The FORGEDSA name, logo, wheel designs and site content belong to us.'
      ]
    },
    {
      title: '12. Liability',
      body: [
        'To the extent the law allows, we are not liable for indirect or consequential loss arising from use of the configurator or our products. Nothing in these terms excludes liability that cannot be excluded under the Consumer Protection Act.'
      ]
    },
    {
      title: '13. Governing law and disputes',
      body: [
        'These terms are governed by the laws of the Republic of South Africa. If something goes wrong, please contact us first; we will try to resolve it quickly. You may also approach the Consumer Goods and Services Ombud (cgso.org.za) or the National Consumer Commission.'
      ]
    }
  ]
};

export const DELIVERY: InfoPageContent = {
  path: '/delivery',
  eyebrow: 'Ordering',
  title: 'Delivery & fitment',
  intro:
    'Every FORGEDSA wheel is forged and finished to order. Here is what happens between your enquiry and the moment your wheels are on the car.',
  sections: [
    {
      title: 'From enquiry to your driveway',
      points: [
        'Enquiry: send your configuration from the configurator. We reply within one to two business days.',
        'Fitment check and quotation: we confirm the specification for your exact car and send a written quotation.',
        'Deposit and production: your wheels are forged, machined and finished to order. Typical lead time is [6–10] weeks from deposit.',
        'Inspection: each wheel is checked for runout, balance and finish before it is packed.',
        'Delivery or fitment: we deliver to you, or fit the wheels by appointment.'
      ]
    },
    {
      title: 'Delivery options',
      points: [
        'Nationwide insured courier: door to door across South Africa, usually [2–5] business days after dispatch. Delivery to main centres is [included / quoted]; outlying areas are quoted on request.',
        'Collection: collect from [our premises / fitment partner, city] by appointment.',
        'Fitment by appointment: we fit, balance and torque your wheels at [fitment partner, city], including TPMS transfer where applicable.',
        'Outside South Africa: available on request. Duties, taxes and import charges are for the buyer.'
      ]
    },
    {
      title: 'Tracking and updates',
      body: [
        'We keep you updated at each stage of production and send a tracking number when your wheels are dispatched. Deliveries need a signature from an adult at the address.'
      ]
    },
    {
      title: 'What is in the box',
      points: [
        'Four wheels, individually protected and boxed.',
        'Centre caps fitted, and valve stems where specified.',
        'Wheel bolts, locking bolts or spacers, if they were part of your order.',
        'A care guide for your finish.'
      ]
    },
    {
      title: 'When your wheels arrive',
      points: [
        'Check that the boxes are intact before signing, and note any visible damage on the delivery slip.',
        'Unpack on a soft surface and inspect every wheel and finish.',
        'Report any damage or discrepancy within 48 hours with photos, to [info@forgedsa.com]. We will arrange a solution.'
      ]
    },
    {
      title: 'Before you fit',
      body: [
        'Test-fit one wheel on each axle before tyres are mounted, especially if your car has upgraded brakes. Forged wheels should be fitted by a qualified technician and the bolts torqued to BMW specification, then re-checked after the first 50–100 km.'
      ]
    }
  ]
};
