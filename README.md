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

## Quotations

Open `http://127.0.0.1:5173/quotation.html`, or select **Quotation** in the sidebar.
The quotation uses the same five designs, editable items, branding, totals, and PDF printing as the invoice.
It includes a validity date, draft status, payment terms, and quotation total.
Quotation presets and numbering are stored separately from invoices; quotation numbers use `WC-Q-YYYY-0001`.
Printing updates the quotation date to today and its validity to 15 days later, and suggests the quotation number as the PDF filename.
