# WizardCog Invoice Studio

A static invoice and quotation editor with four printable designs and a private Supabase workspace. Porcelain is the default; Corporate Teal, Atelier and Signal remain available.

## Run locally

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/index.html` for tax invoices, `/proforma.html` for proforma invoices or `/quotation.html` for quotations. Use port 5173 for the configured local sign-in redirects. Production is `https://invoice.wizardcog.com`.

## Save and issue documents

1. Select **Send sign-in link** for `wizardcogofficial@gmail.com` and open the emailed link in the same browser profile and site origin.
2. Enter the actual client name, address and GSTIN. Select **Unregistered (URP)** only for an unregistered client. Check the place of supply and each service's SAC.
3. **Save draft** stores the document in Supabase without assigning an invoice number. Unsaved edits exist only in the current tab.
4. **Finalize & Print** validates the details, saves the draft and issues it through a database transaction. The database assigns the number, issue date and due date (15 days later). Finalization locks the issued contents.
5. Open an entry under **Saved invoices/quotations** to resume a draft or reprint an issued document. Reprints retain the original number and dates. An invoice can be printed as Original for Recipient or Duplicate for Supplier. Status can be updated to paid/cancelled without rewriting the invoice.

**Print draft** works without signing in and adds a draft watermark. It does not allocate a number. **New invoice/quotation** starts a fresh document. An issued document is never silently turned into another invoice.

If **Finalize & Print** is blocked, the reason appears directly below the button. **Go to sign-in** takes you to the email form. Open the sign-in link in the same browser profile and site where you are creating the document; the app works in any modern browser, but sign-in sessions are not shared between profiles or between localhost and production.

Numbers look like `WC-A7F3-583721` (invoice), `WCP-C2D9-318204` (proforma) or `WCQ-B4E8-427918` (quotation); these are examples only. The series and initial six-digit value are non-obvious, then numbers advance consecutively. The Indian financial year and actual counter remain private. Previewing the next number does not consume it. Printing again, retrying finalization, or recovering a lost response does not allocate another number.

## Cancel a printed invoice and reuse its number

If an invoice was finalized/printed but **never sent to the client**, open it under **Saved invoices** and select **Cancel & reuse number**. The record stays in history as cancelled, and the next invoice you finalize in the same financial year receives that number (the lowest released number is used first). The sidebar shows `Next: … (reused from a cancelled document)` while a released number is waiting.

This is only offered for an issued, unpaid document without an IRN, and only within the same financial year. If the invoice already reached the client, use **Cancelled (number kept)** in Document status instead — that number is retained and reported as cancelled. A released record cannot be reopened.

## Proforma invoices

`proforma.html` issues proforma invoices with their own independent `WCP-` series, labelled "Proforma — not a tax invoice". Client GSTIN is optional on a proforma. Once the client pays or the supply happens, open the issued proforma and select **Create tax invoice from this**: the invoice page opens with the same client, services and tax settings as a fresh draft, noting the proforma number. Finalizing it then assigns the next tax-invoice number.

## Presets and business details

While signed in, **Save** in Client Preset stores a named snapshot in Supabase. Loading a preset creates a fresh draft, even if the preset contains an old document number. Invoice and quotation presets are separate. **Save business details** stores common legal name, address, GSTIN, branding and contact defaults for both pages. Client and payment details are retained in document/preset snapshots.

When signed out, preset saving remains available in this browser's `localStorage`:

- `invoice-studio-presets`
- `proforma-studio-presets`
- `quotation-studio-presets`

Existing browser presets are not deleted or automatically uploaded. After signing in, select **Import browser presets** separately on each page. Import works only in the browser profile and exact origin where the old presets exist. Existing cloud names are preserved on import. Historical PDFs/numbers are not imported or renumbered automatically. Old local sequence keys are no longer used.

Cloud records are restricted by both an approved-email allowlist and owner-based row-level security. Signing into localhost does not sign you into the production site's separate browser storage. See [database setup](supabase/README.md) for migrations, authentication and the Free plan limits.

## GST scope

Every design includes WIZARDCOG's supplied GSTIN `19AAFFW5069E1ZV`, an editable client GSTIN/UIN, SAC per service, place of supply, reverse-charge indication, tax breakup, service/delivery address and an authorised-signatory area. Quotations are explicitly identified as quotations rather than tax invoices.

The supported tax model is taxable domestic IT services at 18%: 9% CGST + 9% SGST/UTGST for an intra-state supply, or 18% IGST for an inter-state supply. Both browser previews and database finalization calculate GST; the server does not trust submitted totals. The rate follows CBIC's [IT/ITES FAQ](https://cbic-gst.gov.in/hindi/sectoral-faq.html). Review [GST coverage and remaining conditions](docs/gst-invoice-review.md) before using a different supply/tax treatment.

## Verification

```bash
node --test tests/gst.test.cjs
node --check script.js
node --check cloud.js
```

With Playwright installed and the local server running:

```bash
node tests/cloud-browser.cjs
```

Browser workflow tests use a fake cloud adapter in an isolated browser and never issue real invoices. Database tests in [supabase/tests/database.sql](supabase/tests/database.sql) exercise the actual RLS/functions inside a transaction that rolls back all fixtures. The eight default design/document combinations were rendered and checked as single-page A4 PDFs, with responsive checks at 375, 768 and 1024 pixels. Longer documents may span pages.
