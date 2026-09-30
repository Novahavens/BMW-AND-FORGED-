# FORGEDSA Wheel Configurator: Client Handover

**Live site:** <https://forged-configurator.vercel.app>
**Admin:** <https://forged-configurator.vercel.app/admin>
**Handed over:** 28 September 2026

This document explains, in plain language, what has been built for FORGEDSA, how your customers use
it, how you run it day to day, and what is still needed from you before launch. No technical
knowledge is needed to read it. The technical companion for a developer is
[`HANDOVER.md`](HANDOVER.md).


A branded PDF version of this document, for sending to the client, is in
[`FORGEDSA-Client-Handover.pdf`](FORGEDSA-Client-Handover.pdf). Its source is `docs/handover/handover.html`,
rebuilt with `node scripts/build-handover-pdf.mjs`.

---

## Outstanding work

The configurator is live and works end to end. **Three pieces of work are outstanding:**

1. **Improve the fidelity of the wheels.** The nine live wheels are built from straight-on photos. They
   look convincing on the car, but spoke depth, the barrel and bolts are approximated up close and in the
   360° view. The next step is real 3D models built from the manufacturer's CAD files (section 7). The
   upload and conversion route is already built. FSA-10 to FSA-17 go live the same way.
   *Needed:* one CAD file per design (STEP ideal), rim only.
2. **Improve the fidelity of the vehicle rendering.** Nine cars have licensed community 3D bodies of
   varying detail; the M5 is closest to photoreal. The work:
   - Replace the weaker bodies with higher-detail, commercially licensed models.
   - Refine materials (glass, lights, tyres, brakes, trim).
   - Raise lighting and reflections, and render the summary and PDF stills at higher quality.
   - Source the M4 Convertible and M5 Touring.
   - Confirm every model's licence.

   *Needed:* your priority order of cars and approval for any paid models.
3. **Check the Terms & conditions and Delivery pages for content accuracy.** Both are live drafts
   (section 8). Every statement must match how FORGEDSA actually trades, the bracketed details must be
   filled in, and your attorney must review them. Then the draft note comes off.
   *Needed:* the bracketed details and legal sign-off.

---

## 1. What you have, in one paragraph

A premium, 3D online showroom where a BMW M owner picks their exact car and factory paint colour,
then tries your forged wheels on it in real time: design, size and finish, from any angle, on a
laptop or phone. When they are happy, they get a summary of their build with studio images and the
price, can download a branded PDF, share a link, and send you an enquiry. Every PDF download and enquiry
is emailed to you straight away as a branded lead summary. Behind it sits a secure
**back end** (database, file storage and logins) and an **admin panel** where you add wheels, cars
and prices yourself, and read customer enquiries. No developer is needed for day-to-day changes.

---

## 2. The customer journey, step by step

We mapped and built every step a customer takes, from the first second to the PDF they keep.

| Step | What the customer sees | Why it matters |
|---|---|---|
| **1. Loading** | A FORGEDSA wheel drawn in fine gold lines while the 3D studio loads. | First impression is on-brand, never a blank screen. |
| **2. Welcome** | A BMW M turning slowly in a dark studio, the FORGEDSA logo, a region/currency picker (South Africa and Rand by default) and **Enter**. Your Instagram, TikTok and YouTube links sit underneath. | Sets the premium tone and the right currency straight away. |
| **3. Showroom** | One car at a time with its model name huge behind it. Arrows drive the car out and the next one in. **Explore** or **Build**. | Customers find *their* car: 11 BMW M models. |
| **4. Short notice** | A one-line note that the cars are visualisations and final fitment is confirmed with your team. | Manages expectations before they configure. |
| **5. Configurator** | Four simple steps in a side panel (bottom sheet on phones): **Paint** → **Wheels** → **Size** → **Finish**. Picking a wheel, size or finish cuts the camera to a close-up of the wheel. A running price is always visible. | The heart of the experience: they see *their* car on *your* wheels. |
| **6. 360° wheel view** | Any wheel on its own, rotating, with its finishes, sizes and price. | Lets them study the design up close. |
| **7. Summary** | Three studio images of their build, every option chosen, the price, and buttons to share, download the PDF or enquire. | Turns interest into a lead. |
| **8. The PDF** | Before it downloads, the customer enters their **email address and mobile number** (name optional). Then a two-page, dark, gold FORGEDSA spec sheet is generated instantly in their browser: studio images, options, price, wheel story, next steps, a link back to their exact build, your social channels and contact details. | Something they keep and forward, and every download gives you a lead with their contact details and exact build, emailed to you straight away. |
| **9. Enquiry** | A short form (name, email, phone, message, "I'd like a consultation"). Their full configuration is attached automatically. | You receive a qualified lead with the exact build, by email within seconds (section 6). |
| **10. Share link / code** | Every build gets a short code and link that reopens it exactly. | Customers can send their build to friends; you can open it from an enquiry. |

Also on the site: **The collection** (all wheel designs), **Delivery & fitment**, **Terms &
conditions**, and a footer with your social channels and contact details on every long page.

### What customers choose

- **Car:** 11 BMW M models (M2, M235i, M3, M3 Touring, M4, M4 Convertible, M5, M5 Touring, M8, X3 M50, X5 M).
  The X5 M is the 2024 facelift X5 M Competition. The Sketchfab model first suggested for it is a paid
  store model under an *Editorial* licence (no commercial use), so a freely licensed facelift model (CC BY,
  credited) was prepared instead.
- **Paint:** the exact BMW South Africa factory colours offered for that car (64 colours in total, researched
  from BMW's own configurator). A customer can match what they specced at the dealer.
- **Wheel design:** your real FORGEDSA wheels (9 live now, see section 7).
- **Size:** only the sizes you offer for that wheel, each with its own price.
- **Finish:** Liquid Metal (chrome), Bronze Matte, Black Gloss and Silver.

---

## 3. The look: your brand kit, applied

The whole site now follows the FORGEDSA Official Brand Design System:

- **Colours:** Matte Carbon (#121212) backgrounds and Gunmetal (#2A2A2A) surfaces.
  - **Electric Orange (#FF5A00)** is the action colour, used only on the main buttons that move a customer
    forward: Enter, Build, Confirm, View your build, Download PDF, Send enquiry. The same colour is used for
    the "Open your build online" button in the PDF and the Reply button in the lead email.
  - **Forged Gold (#CF9F52)** is used for everything else that stands out: the logo, selected options, steps,
  prices and headings. Brass Light (#E8C37D) is used for hovers.
- **Type:** Satoshi for headlines, Inter for everything else, exactly as the kit specifies.
- **Logo:** the gold FORGEDSA wordmark in the header of every page and on the PDF. We cut it out of the
  image you sent (which had a printed checkerboard, not real transparency).
- **Social channels:** Instagram @ForgedSA, TikTok @ForgedSA, YouTube /ForgedSA and www.forgedsa.com
  appear on the welcome screen, in the menu, in the footer and in the PDF.
- **Favicon (browser tab icon):** a temporary gold "F". Send us the hexagon monogram and we swap it in.

---

## 4. Behind the scenes: the back end

We set up a proper back end so the site is secure and you can manage it without a developer.

| Part | What it does | Where it lives |
|---|---|---|
| **Database** | Holds every car, paint colour, wheel, finish and price, plus saved builds and customer enquiries. | Supabase (a hosted database service) |
| **File storage** | Holds the 3D car files, wheel images and wheel 3D models. | Supabase Storage |
| **Logins** | Only people on your admin list can change anything. The protection is enforced by the database itself, not just hidden buttons. | Supabase Auth |
| **Hosting** | Serves the website worldwide, fast. | Vercel |
| **Lead emails** | Emails forgedsa1@gmail.com a branded summary of every PDF download and enquiry (section 6). | Database trigger + n8n + Gmail |
| **Wheel pipeline** | Turns wheel photos plus a Google Sheet into wheels in the app automatically (section 7). | n8n automation + Google Sheet |

**Know-how written down:** every recurring job (adding a car or wheels, tuning the paint, the lead
emails, publishing changes, keeping keys safe) is written up as a step-by-step playbook inside the
project (`docs/SKILLS.md`). Any developer, or an AI assistant such as Claude, can pick up the work
without starting from scratch.

If the database were ever unreachable, the site falls back to a built-in copy of the catalogue, so a
customer never sees an empty page.

---

## 5. Your admin panel

Go to **/admin** and sign in with your admin email and password. You will see five tabs.

**First sign-in, or a forgotten password:** on the /admin sign-in click **First time here, or forgot your
password?**, enter your admin email and press **Email me a link**. Open the email on the same device; it
brings you back to /admin to choose your password. (Your account, fazal@novahavens.com, already exists.)

**Adding another admin:** create their account in Supabase
([Authentication → Users](https://supabase.com/dashboard/project/qxlfkfhzpqbxffuqqewg/auth/users) →
**Add user**, tick **Auto Confirm User**), then add their email to the admin list (one line of SQL, in
`HANDOVER.md` section 1). They then use the same "First time here" link to set their password. Supabase's
built-in email only delivers to members of your Supabase team; to email other admins, add your own SMTP
provider under Authentication → Emails.

| Tab | What you can do |
|---|---|
| **Cars** | Add a car, upload its 3D model, choose which factory paints it offers, hide or reorder cars. |
| **Wheels** | Add a wheel design, upload its image or 3D model, write its name and description, set **sizes and prices**, choose which finishes it comes in, hide or reorder wheels. |
| **Finishes** | Edit the four finishes (name, colour, how shiny or matte). |
| **Paints** | Edit the factory paint list. |
| **Enquiries** | Every enquiry customers send **and every PDF download** (marked "PDF download"), newest first, with their contact details and full build. **Reply** opens an email to them, **Open build** shows their exact configuration, **Export CSV** downloads them all for a spreadsheet or CRM. |

### Everyday tasks

- **Change a price:** Wheels → click the wheel → change the price next to a size → **Save**. The site
  updates immediately. The "from" price is worked out for you.
- **Add or remove a size:** in the same wheel, add a size with the **+ 22"** style buttons or remove one
  with the bin icon → **Save**.
- **Hide something without deleting it:** untick **Visible in configurator** → **Save**.
- **Change the order:** set **Sort order** (lower numbers appear first).
- **Add a new wheel:** see section 7.
- **Add a new car:** Cars → **New** → fill in the name → upload the car's 3D file (.glb) → pick its
  factory paints → **Save**. A developer may need to fine-tune which parts of the model take the paint
  colour the first time (explained in `HANDOVER.md`).
- **Give someone admin access:** they need an account and to be on the admin list; see `HANDOVER.md`
  section 1 (a two-minute job for whoever manages the Supabase account).

---

## 6. New-lead emails

Every time a customer **downloads the PDF** or **sends an enquiry**, a branded email lands in
**forgedsa1@gmail.com** within a few seconds. You don't need to check the admin panel to know
someone is interested.

**What the email shows**

- The subject says which kind of lead it is: **"New PDF download: Thabo Mokoena · BMW M4 Competition"**
  or **"New enquiry: …"**. The same label appears at the top of the email.
- The customer's **name, email and mobile** (tap to email or call), when they came in (SA time), and
  whether they asked for a consultation.
- Their message, for enquiries.
- **Their build:** the wheel image, car and generation, paint (with a colour swatch and whether it's
  metallic, uni or frozen), wheel design and code, size, finish (with a swatch) and region.
- The **wheel set price** in the currency they chose, and their **build code**.
- Two buttons: **Reply to [name]** (an email already addressed to them) and **Open their build**
  (their exact configuration on the site). Pressing Reply in Gmail also goes straight to the customer.

The email uses the brand look: Matte Carbon background, Forged Gold accents, the FORGEDSA wordmark,
and a layout that works on a phone.

**How it works**

1. The customer's details and build are saved in the database (the Enquiries tab), exactly as before.
2. The moment the lead is saved, the database passes it to an **n8n** automation called
   *FORGEDSA · Lead email (PDF downloads + enquiries)*.
3. n8n builds the email and sends it through the connected Gmail account (currently
   fazal@novahavens.com, shown as "FORGEDSA Leads").

If the email ever fails (for example, Gmail disconnects), the lead is **still saved** in the admin
panel. Nothing is lost and the customer never sees an error.

**Good to know**

- **Change who receives the emails:** in n8n open the workflow → the *Email forgedsa1@gmail.com* step →
  change **To** (add more addresses separated by commas) → **Publish**.
- **Send from a different Gmail account** (for example forgedsa1@gmail.com itself): connect that account
  as a Gmail credential in n8n and select it in the same step.
- **Check it is working:** n8n → the workflow → **Executions** lists every lead email with a green
  tick or a red error.
- The first time emails come from a new sender, Gmail may file them under Promotions or Updates. Drag one
  to Primary and choose "Do this for future messages".

---

## 7. Your wheels

### Live today

Nine FORGEDSA designs are live (FSA-01 to FSA-09), made from the front-on photos in your
*Wheel designs* zip. The six placeholder wheels the app started with have been removed.

The names (South African circuits), codes and prices are **placeholders we made up** so you could see the
experience end to end. Change them in the admin panel or the `wheels` Google Sheet.

### The wheels sheet

There is an editable Google Sheet called **wheels** in your FORGEDSA Drive folder:
<https://docs.google.com/spreadsheets/d/1OJJYaZsVSuJIgjnYkiSE55hBF7_l6y2o4dJH0SehOIM/edit>. One row per
design: photo file name, name, code, sizes, prices in Rand, finishes and the product copy. The automated
pipeline reads it to add new wheels. Rows marked `skip` = yes are left alone.

### How photo wheels work, and their limit

The app turns a straight-on photo of a wheel into 3D spokes on the car. On the car, at normal viewing
distance, this looks convincing. Up close in the 360° view you can tell it is not a true 3D model:
spoke depth and the inner barrel are approximated.

### The photorealistic route: CAD files → real 3D wheels

Forged wheels are machined from CAD drawings, so the exact 3D shape of every design already exists at
your manufacturer. From those files we produce real 3D models, with true spoke depth, barrel, bolts and
edges, that look photoreal from every angle, including the 360° view.

**What we need from you:** ask your manufacturer for the CAD file of each design (STEP / STP files are
ideal; IGES, STL or OBJ also work). One file per design is enough.

**What happens then:** in the admin panel open **Wheels → the wheel → Rim 3D model → Upload** and pick
the CAD file. It is converted automatically into a light, web-ready 3D wheel: turned to face outwards,
sized, smoothed and given a single finish surface so Liquid Metal, Bronze Matte, Black Gloss and Silver
all apply. Click **Save**. A 3D model always takes priority over the photo, so the wheel upgrades on
every car immediately. The eight designs that only have angled photos (FSA-10 to FSA-17) go live this
way too.

Tips:
- Send the **rim only** (no tyre). If the manufacturer sends a full wheel assembly, ask for the rim part.
- If the spokes ever face into the car, tick **Flip 3D rim** and Save.
- Very large assembly files (over about 50 MB) are better converted by your developer with the included
  converter (`bun run rim:convert wheel.step`), which does the same thing on a computer.

---

## 8. Terms & conditions and Delivery & fitment

Both pages are live at **/terms** and **/delivery**, linked from the menu, the footer and the PDF.

They are **drafts**, written as a sensible South African starting point (Consumer Protection Act,
POPIA, deposits for made-to-order goods, cancellations, warranty, fitment, courier delivery, inspection
on arrival). Each page shows a small "Draft for review" note until they are approved.

Before launch:

1. Have your attorney review both pages.
2. Fill in everything in [square brackets]: company name, registration and VAT numbers, deposit
   percentage, payment methods, warranty periods, lead times, delivery costs, collection and fitment
   address, Information Officer.
3. Ask your developer to update the text (one file, `config/pages.ts`) and remove the draft note.

---

## 9. Details to send us before launch

| # | Item | Why |
|---|---|---|
| 1 | **CAD files** for each wheel design from your manufacturer | Outstanding work 1: photoreal 3D wheels (section 7) |
| 2 | **Car priority** and approval for paid 3D models | Outstanding work 2: vehicle rendering |
| 3 | Real wheel **names, codes, sizes and prices** | The current ones are placeholders |
| 4 | Your real **email and phone number** | The site shows placeholders (info@forgedsa.com, +27 00 000 0000) |
| 5 | **Legal review** of Terms and Delivery, and the [bracketed] details | Outstanding work 3; required before taking orders |
| 6 | The **hexagon monogram** file (PNG or SVG with transparency) | Browser tab icon and social avatar |
| 7 | **Wheel weights**, if you want them shown | The weight panel appears automatically once a wheel has weights |
| 8 | Your own domain (e.g. configure.forgedsa.com), if wanted | We can point it at the site in minutes |

---

## 10. Accounts and running costs

| Service | Used for | Plan |
|---|---|---|
| Vercel | Hosting the website | Free tier (upgrade if traffic grows) |
| Supabase | Database, storage, logins | Free tier. Free projects pause after a week with no visits; open the site or admin weekly, or upgrade to Pro (about US$25/month) at launch. |
| n8n | Wheel pipeline and new-lead emails | Your existing n8n account |
| Google Drive | Wheels sheet and photos | Your existing account |
| Gmail | Sends the new-lead emails (via n8n) | Free |
| OpenRouter | AI image tools used by the wheel pipeline | Pay per use (about US$0.15–0.30 per wheel). Its privacy settings must allow the Sourceful and Google providers. |

---

## 11. Quick glossary

- **Back end:** the behind-the-scenes part (database, storage, logins) that customers never see.
- **Admin panel:** your private page for editing the catalogue and reading enquiries.
- **3D model / GLB:** a file describing an object's shape in 3D, like the cars and (soon) your wheels.
- **CAD file / STEP:** the engineering drawing your manufacturer machines the wheel from.
- **Configuration code:** the short code that reopens a customer's exact build.
- **Pipeline:** an automation that turns photos plus a spreadsheet into wheels in the app.
- **Webhook:** a private web address one system calls to hand information to another, here how the database
  passes each new lead to n8n.
