# WizardCog invoice database

The dedicated **wizardcog-invoices** project (`tyeacscersyphhevmfdh`) belongs to **wizardcogofficial's Org**, on **Free**, in South Asia (Mumbai). It was created in Chrome's **Wizard** profile under the **wizardcog** Supabase account.

[Project dashboard](https://supabase.com/dashboard/project/tyeacscersyphhevmfdh)

## Applied migrations

All three migrations have been applied in order to this project. For a new project, apply each file once in SQL Editor:

1. `migrations/202610260001_invoice_database.sql` — private tables, RLS, issued-record protection and atomic numbering.
2. `migrations/202610260002_gst_validation.sql` — snapshot validation, GSTIN checksum and server-side tax calculation.
3. `migrations/202610260003_workspace_access.sql` — approved-email restriction and stable next-number preview.

| Table | Purpose |
| --- | --- |
| `business_settings` | Common business/legal/branding defaults |
| `clients` | Schema for a future client directory; the current UI uses snapshots/presets |
| `client_presets` | Named invoice/quotation snapshots |
| `documents` | Draft/issued snapshots, original dates, numbers and status |
| `document_sequences` | Private counters and opaque financial-year series |
| `workspace_members` | Private approved-email allowlist |

Every table has RLS. Anonymous roles cannot read or write records or call issuance functions. Approved signed-in users see only their own rows. The allowlist is enforced inside the database, not merely by the email field in the UI. The approved account is `wizardcogofficial@gmail.com`; there is no shared client login.

Counters cannot be edited by the browser. `prepare_document_series(type)` prepares/reads the current financial-year series without consuming a number. `finalize_document(id)` validates the draft, recalculates 18% GST from its services, locks the document, increments the counter atomically and assigns the number. Repeating the call returns the existing issued record. Invoice and quotation counters are independent. `set_document_status` updates status while retaining the original contents.

Numbers use an opaque four-character series plus a random six-digit starting point, then advance consecutively. A new Indian financial year (April–March) gets a distinct series. The format is under 16 characters, as required by [CGST Rule 46(b)](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001). Previously issued documents must retain their historical numbers.

## Frontend and authentication

`cloud-config.js` contains the project URL and **public publishable key**. This key is intended for browser use; Auth and database policies control access. Never put a database password, service-role key, secret key or access token in the repository.

`cloud.js` loads Supabase JS v2 and handles passwordless email sign-in, cloud presets, business defaults, drafts/history, numbering and status. Production Site URL is `https://invoice.wizardcog.com`. The configured redirects include the production root, invoice/quotation HTML paths, `/quotation`, and localhost/127.0.0.1 port 5173 document paths. Additional development origins must be explicitly allowlisted in Supabase Auth before sign-in will return there.

Sign-in sessions are specific to the browser profile and origin. Import old local presets explicitly from their original profile/origin. Historical PDFs and local numbering counters are not migrated automatically.

## Verification

Run `tests/database.sql` as `postgres` in SQL Editor. It creates synthetic users, approved test members, presets, documents and counters inside one transaction, then rolls everything back. It checks stable preview, private records, cross-owner access rejection, unapproved-user rejection, anonymous restrictions, server GST amounts, consecutive/separate numbering, repeat finalization, status updates and issued-record protection. These checks passed against the project after all migrations.

The browser tests in `../tests/cloud-browser.cjs` cover the app's draft/finalize/reprint flow with a fake adapter. A real sign-in, next-number read and business-settings save were also checked in the Wizard profile. No test invoices were issued under the actual business account.

## Free plan and data care

No paid plan or add-on was enabled. Supabase Free has [usage limits](https://supabase.com/docs/guides/platform/billing-on-supabase) and projects with low activity over seven days [may pause](https://supabase.com/docs/guides/platform/free-project-pausing). Resume the project from its dashboard if that happens. Do not upgrade without a separate decision about cost.

Keep copies of issued PDFs and export database records periodically. Large embedded logo, signature and QR images count toward database usage. This app is not an accounting ledger, GST return-filing system, IRP registration integration or a backup service.
