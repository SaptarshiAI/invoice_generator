# Invoice Generator

A fully editable browser-based invoice template generator for creating consistent client invoices.

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
