# Invoice & Quotation Generator

A fully editable browser-based invoice and quotation template generator for creating consistent client documents.

## Open Locally

This is a static HTML/CSS/JavaScript app. No install step is required.

From the project folder, run:

```bash
python3 -m http.server 5173
```

Then open this URL in your browser:

```text
http://127.0.0.1:5173/index.html
```

## If You Are Not In The Project Folder

Run:

```bash
cd "/Users/saptarshimandal/Projects/Apps/Invoice Generation"
python3 -m http.server 5173
```

Then open:

```text
http://127.0.0.1:5173/index.html
```

## If Port 5173 Is Busy

Use another port, for example:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/index.html
```

## Stop The Local Server

In the terminal where the server is running, press:

```text
Control + C
```

## Notes

- Click any invoice text to edit it.
- Use `Print / Save PDF` to generate a printable invoice.
- The invoice date updates automatically when printing.
- The due date is set to 15 days after the invoice date.
- The Save as PDF filename should use the invoice number as the browser's suggested filename.
- Both invoices and quotations automatically calculate **GST (18%)** from the line-item subtotal. Editing quantities or rates, adding or removing items, and loading a preset recalculates GST and the grand total. GST is calculated rather than manually editable, and monetary values are rounded to paise.

The 18% rate is intended for taxable domestic IT services such as ERPNext implementation, customization, and support. CBIC's [IT/ITES FAQ](https://cbic-gst.gov.in/hindi/sectoral-faq.html) lists IT services at 18%; qualifying exports/SEZ supplies can have different treatment.

## Quotations

Open `http://127.0.0.1:5173/quotation.html`, or select **Quotation** in the sidebar.
The quotation uses the same four designs, editable items, branding, totals, and PDF printing as the invoice.
It includes a validity date, draft status, payment terms, and quotation total.
Quotation presets and numbering are stored separately from invoices; quotation numbers use `WC-Q-YYYY-0001`.
Printing updates the quotation date to today and its validity to 15 days later, and suggests the quotation number as the PDF filename.

## Designs

Choose a design from the **Template** dropdown on the invoice or quotation page:

Porcelain is the default on both pages and when resetting the design or starting a new document.

- **Corporate Teal** — navy and teal with an executive layout.
- **Atelier** — warm paper tones and premium serif branding.
- **Signal** — a bold, modern layout with slate and mint accents.
- **Porcelain** — plum serif headings, blush panels, fine rules, and a spacious editorial layout.

Each design has its own closing details: Corporate Teal uses an angled navy-and-teal footer, Atelier pairs a gold-ruled studio footer with a warm bank folio, Signal uses slate-and-mint contact and payment panels, and Porcelain pairs its curved blush signature panel with a serif payment card. Quotation payment terms use the same design treatments. Footer branding, the closing message, contact details, and payment fields remain editable and save with client presets.

All designs use the common WizardCog logo, business address, contact details, and existing document fields, and support client presets, mobile screens, and A4 PDF printing. Saved presets using a removed design load with Porcelain while preserving the preset's document data.

## Where Client Presets Are Saved

There is no database or backend. Clicking **Save** stores the document snapshot in the browser's `localStorage` as JSON:

- Invoice presets: `invoice-studio-presets`
- Quotation presets: `quotation-studio-presets`

Each preset includes the template, editable document fields, line items, logo, and optional cover image. GST is recalculated at 18% when loading a preset, including older presets that contain a manually entered tax amount. Saving under the same name replaces that preset. Unsaved edits are not automatically persisted.

Storage belongs to the current browser profile and exact site origin (protocol, hostname, and port). For example, `http://127.0.0.1:5173` and `http://localhost:5173` have separate storage, as do different ports. Presets survive normal reloads and browser restarts but do not sync across browsers or devices. Clearing site data deletes them; private browsing storage is temporary.

To inspect the saved JSON, open browser developer tools, then **Application / Storage → Local Storage → the current origin**. Invoice and quotation numbering are also stored locally under their respective `*-studio-wizardcog-sequence` keys.
