# GST invoice review — 26 October 2026

Scope: WizardCog's taxable domestic IT implementation, development, consulting and support services. This records the template coverage and conditions that depend on the actual business/supply.

CBIC's [IT/ITES FAQ](https://cbic-gst.gov.in/hindi/sectoral-faq.html) gives 18% for IT services, including software development/customisation treated as services. [The service classification annexure](https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification11-CGST-Annexure.pdf) distinguishes IT consulting/support (998313) from design/development (998314); check the editable SAC against the actual work.

The following fields are present in all four invoice designs; quotations carry equivalent business/tax details with a quotation label:

| Particular | Coverage |
| --- | --- |
| Supplier legal name/address/GSTIN | WIZARDCOG and supplied GSTIN `19AAFFW5069E1ZV`; editable business details |
| Recipient name/address/GSTIN or UIN | Editable; registered-client GSTIN validated before invoice issuance; explicit URP mode |
| Consecutive number and issue date | Assigned atomically by the database; opaque series, under 16 characters, financial-year tracking |
| Service classification and description | Six-digit SAC and description on every service |
| Total/taxable value, rate and amount | Line totals, taxable value, 18% GST and total due; no discounts/cess model |
| CGST/SGST/UTGST/IGST breakup | Determined from supplier state and selected place of supply |
| Place of supply and delivery address | State/code and separate service/delivery address |
| Reverse charge | Explicit Yes/No; when enabled, disclosed GST is excluded from the supplier amount due |
| Authorisation | Signatory name/space and optional uploaded signature |
| Service invoice copies | Original for Recipient / Duplicate for Supplier reprint selector |
| Conditional e-invoice information | Optional supplied IRN, acknowledgement and IRP signed QR |

The baseline particulars and numbering come from [CGST Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001). A number is allocated only when finalizing; a reprint retains the number/date and stored contents.

Before issuing a real document, enter the actual registered client details or select URP, verify the place of supply, SAC, addresses and applicability of reverse charge, and apply the authorised signature where required. GSTIN validation checks format/state/checksum; it does not verify government registration status or legal-name/address matching.

If e-invoicing applies to the business/transaction, obtain a valid IRN and signed QR through an authorised IRP. The optional fields only include existing IRP output in the document; uploading an image does not register an invoice or verify a cryptographic signature. This app does not determine e-invoice eligibility from turnover. Coordinate the invoice number shown in the private preview with the IRP process before printing the final document.

Export/SEZ/LUT endorsements and zero-rating, exempt/mixed supplies, goods, discounts, cess, credit/debit notes, advances, time-of-supply decisions and GST return filing are outside this implementation. A quotation is not a tax invoice. The template is not a blanket determination that every business or transaction meets all GST obligations.
