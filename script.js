const invoicePage = document.getElementById("invoicePage");
const templateSelect = document.getElementById("templateSelect");
const logoUpload = document.getElementById("logoUpload");
const imageUpload = document.getElementById("imageUpload");
const logoBox = document.getElementById("logoBox");
const imageStrip = document.getElementById("imageStrip");
const lineItems = document.getElementById("lineItems");
const subtotal = document.getElementById("subtotal");
const grandTotal = document.getElementById("grandTotal");
const taxAmount = document.getElementById("taxAmount");
const saveStatus = document.getElementById("saveStatus");
const presetName = document.getElementById("presetName");
const presetSelect = document.getElementById("presetSelect");

const defaultDocumentTitle = document.title;
const defaultTemplate = "porcelain";
const documentType = ["quotation", "proforma"].includes(document.body.dataset.documentType)
  ? document.body.dataset.documentType
  : "invoice";
const isQuotation = documentType === "quotation";
const isProforma = documentType === "proforma";
const documentLabel = { invoice: "invoice", quotation: "quotation", proforma: "proforma invoice" }[documentType];
const proformaHandoffKey = "invoice-from-proforma";
const storageKey = `${documentType}-studio-presets`;
const presetTypes = ["invoice", "proforma", "quotation"];
const presetTypeLabels = { invoice: "Invoice presets", proforma: "Proforma presets", quotation: "Quotation presets" };
const wizardCogLogo = "assets/wizardcoglogo-transparent-cropped.png";
const cloud = window.invoiceCloud;
let currentDocument = null;
let cloudPresets = null;
let lastCloudUser = null;
let documentDirty = false;
let placeOfSupplyTouched = false;
let totalsBreakdown;
let isFinalizing = false;
let draftSave = null;
const templateClasses = [
  "template-corporate",
  "template-atelier",
  "template-signal",
  "template-porcelain",
];
const wizardCogDefaults = {
  brandLabel: "ERP That Works Like Magic",
  brandName: "WizardCog",
  footerMessage: "Let's build what's next.",
  invoiceType: isQuotation ? "Quotation" : isProforma ? "Proforma Invoice" : "Tax Invoice",
  invoiceNumber: "DRAFT",
  invoiceStatus: "Draft",
  senderName: "WIZARDCOG",
  supplierGstin: "19AAFFW5069E1ZV",
  supplierState: "West Bengal (19)",
  clientGstin: "",
  clientState: "West Bengal (19)",
  copyType: isQuotation ? "Quotation — not a tax invoice" : isProforma ? "Proforma — not a tax invoice" : "Original for Recipient",
  deliveryAddress: "Same as billing address",
  signatoryName: "",
  senderAddress: "7, Block-1, Flat - 7A, Om Residency, 83A, Cossipore Road, 4B bus stand, Cossipore, Kolkata, Kolkata, West Bengal, 700002",
  notes: isQuotation
    ? "Thank you for considering WizardCog. This quotation is valid for 15 days from the issue date. Please contact us to confirm acceptance."
    : isProforma
      ? "This is a proforma invoice, not a tax invoice. A GST tax invoice will be issued on receipt of payment / supply of services."
      : "Thank you for choosing WizardCog. Payment can be made by bank transfer.",
  bankName: isQuotation ? "To be agreed upon acceptance" : "Karur Vysya Bank",
  accountNumber: isQuotation ? "To be confirmed" : "3101135000023718",
  ifscCode: isQuotation ? "As listed above" : "KVBL0003101",
  ...(isQuotation ? { upiId: "Written confirmation required" } : {}),
  supportEmail: "support@wizardcog.com",
  phoneNumber: "+91-7001656375",
  domain: "wizardcog.com",
};
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function cleanNumber(value) {
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return currency.format(value);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatInvoiceDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function cleanInvoiceFileName(invoiceNumber) {
  return invoiceNumber.replace(/^#/, "").replace(/[\\/:*?"<>|]/g, "-").trim() || documentType;
}

function setInvoiceDates(issueDate = new Date()) {
  setPresetField("issueDate", formatInvoiceDate(issueDate));
  setPresetField("dueDate", formatInvoiceDate(addDays(issueDate, 15)));
}

function setStatus(message) {
  saveStatus.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    saveStatus.textContent = "Ready";
  }, 1800);
}

function calculateTotals() {
  let subtotalPaise = 0;

  lineItems.querySelectorAll(".line-item").forEach((row) => {
    const qty = cleanNumber(row.querySelector('[data-number="qty"]').textContent);
    const rate = cleanNumber(row.querySelector('[data-number="rate"]').textContent);
    const lineTotalPaise = InvoiceGST.lineTotalPaise(qty, rate);
    row.querySelector(".line-total").textContent = formatCurrency(lineTotalPaise / 100);
    subtotalPaise += lineTotalPaise;
  });

  const supplierGstin = getPresetFieldText('supplierGstin').toUpperCase();
  const supplierState = supplierGstin.slice(0, 2) || '19';
  const supplyState = document.getElementById('placeOfSupplySelect')?.value || '19';
  const reverseCharge = document.getElementById('reverseChargeSelect')?.value === 'yes';
  totalsBreakdown = InvoiceGST.breakdown(subtotalPaise, supplierState, supplyState, reverseCharge);
  subtotal.textContent = formatCurrency(subtotalPaise / 100);
  taxAmount.textContent = formatCurrency(totalsBreakdown.gstPaise / 100);
  grandTotal.textContent = formatCurrency(totalsBreakdown.totalPaise / 100);
  document.getElementById('cgstAmount').textContent = formatCurrency(totalsBreakdown.cgstPaise / 100);
  document.getElementById('sgstAmount').textContent = formatCurrency(totalsBreakdown.sgstPaise / 100);
  document.getElementById('igstAmount').textContent = formatCurrency(totalsBreakdown.igstPaise / 100);
  document.getElementById('cgstRow').hidden = totalsBreakdown.interstate;
  document.getElementById('sgstRow').hidden = totalsBreakdown.interstate;
  document.getElementById('igstRow').hidden = !totalsBreakdown.interstate;
  document.getElementById('sgstRow').querySelector('span').textContent = ['04', '26', '31', '35', '38', '97'].includes(supplierState) ? 'UTGST (9%)' : 'SGST (9%)';
  document.getElementById('placeOfSupply').textContent = InvoiceGST.stateLabel(supplyState);
  document.getElementById('reverseChargeText').textContent = reverseCharge ? 'Yes' : 'No';
  document.getElementById('gstPaymentNote').textContent = reverseCharge
    ? 'GST shown above is payable by the recipient under reverse charge and is excluded from the amount due.'
    : 'GST is payable by the supplier.';
  setPresetField('supplierState', InvoiceGST.stateLabel(supplierState));
}

function readFileAsDataUrl(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

function setLogo(src) {
  logoBox.innerHTML = "";
  const img = document.createElement("img");
  img.alt = "Uploaded logo";
  img.src = src;
  logoBox.appendChild(img);
}

function clearLogo() {
  logoBox.innerHTML = "<span>Logo</span>";
}

function setCoverImage(src) {
  imageStrip.classList.remove("is-empty");
  imageStrip.innerHTML = "";
  const img = document.createElement("img");
  img.alt = `Uploaded ${documentType} visual`;
  img.src = src;
  imageStrip.appendChild(img);
}

function clearCoverImage() {
  imageStrip.classList.add("is-empty");
  imageStrip.innerHTML = "<span>Optional image area</span>";
}

function setPresetField(name, value) {
  invoicePage.querySelectorAll(`[data-preset-field="${name}"]`).forEach((field) => {
    field.innerHTML = sanitizeEditableHtml(value);
  });
}

function sanitizeEditableHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  const allowed = new Set(['BR', 'DIV', 'P', 'B', 'STRONG', 'I', 'EM', 'U', 'SPAN']);
  template.content.querySelectorAll('*').forEach(element => {
    if (!allowed.has(element.tagName)) element.replaceWith(document.createTextNode(element.textContent));
    else [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
  });
  return template.innerHTML;
}

function getPresetFieldText(name) {
  return invoicePage.querySelector(`[data-preset-field="${name}"]`)?.textContent.trim() || "";
}

function applyWizardCogDefaults() {
  Object.entries(wizardCogDefaults).forEach(([key, value]) => setPresetField(key, value));
  setPresetField("invoiceNumber", "DRAFT");
  setInvoiceDates();
  presetName.value = `${templateSelect.selectedOptions[0].textContent.split(" - ")[0]} Default`;
  setLogo(wizardCogLogo);
  clearCoverImage();
}

function addLineItem(description = "New service", qty = "1", rate = "0", sac = "998313") {
  const row = document.createElement("div");
  row.className = "line-item";
  row.innerHTML = `
    <div class="item-description"><div contenteditable="true" data-item-description></div><small class="item-classification">SAC <span contenteditable="true" data-item-sac></span><span class="item-gst-rate">GST 18%</span></small></div>
    <div contenteditable="true" data-number="qty"></div>
    <div contenteditable="true" data-number="rate"></div>
    <div class="line-total">₹0</div>
    <button class="remove-line" type="button" aria-label="Remove line item">&times;</button>
  `;
  row.querySelector('[data-item-description]').innerHTML = sanitizeEditableHtml(description);
  row.querySelector('[data-item-sac]').textContent = sac;
  row.querySelector('[data-number="qty"]').textContent = String(cleanNumber(qty));
  row.querySelector('[data-number="rate"]').textContent = String(cleanNumber(rate));
  lineItems.appendChild(row);
  calculateTotals();
}

// Presets from every document type, so a client set up once can be reused on any page.
function getPresets() {
  if (cloud.user && cloudPresets) return cloudPresets;
  return presetTypes.flatMap(type => Object.entries(getLocalPresets(type)).map(([name, snapshot]) => ({ type, name, snapshot })));
}

function getLocalPresets(type = documentType) {
  try {
    return JSON.parse(localStorage.getItem(`${type}-studio-presets`)) || {};
  } catch {
    return {};
  }
}

// Keep the client, services, design and tax settings, but use this page's own
// title, copy label and notes (and payment wording when a quotation is involved).
function adaptPresetSnapshot(preset) {
  if (preset.type === documentType) return preset.snapshot;
  const snapshot = structuredClone(preset.snapshot);
  const keys = ['invoiceType', 'copyType', 'notes'];
  if (isQuotation || preset.type === 'quotation') keys.push('bankName', 'accountNumber', 'ifscCode', 'upiId');
  snapshot.fields = { ...snapshot.fields };
  keys.forEach(key => {
    if (key in wizardCogDefaults) snapshot.fields[key] = wizardCogDefaults[key];
    else delete snapshot.fields[key];
  });
  return snapshot;
}

function savePresets(presets) {
  localStorage.setItem(storageKey, JSON.stringify(presets));
}

function collectInvoiceState() {
  const fields = {};
  invoicePage.querySelectorAll("[data-preset-field]").forEach((field) => {
    fields[field.dataset.presetField] = field.innerHTML;
  });

  const items = [...lineItems.querySelectorAll(".line-item")].map((row) => ({
    description: row.querySelector('[data-item-description]').innerHTML,
    qty: String(cleanNumber(row.querySelector('[data-number="qty"]').textContent)),
    rate: String(cleanNumber(row.querySelector('[data-number="rate"]').textContent)),
    sac: row.querySelector('[data-item-sac]').textContent.trim(),
  }));

  return {
    template: invoicePage.className.match(/template-\w+/)?.[0]?.replace("template-", "") || defaultTemplate,
    fields,
    items,
    logo: logoBox.querySelector("img")?.src || "",
    cover: imageStrip.querySelector("img")?.src || "",
    signature: document.getElementById('signatureImage').querySelector('img')?.src || '',
    taxSettings: {
      placeOfSupply: document.getElementById('placeOfSupplySelect').value,
      reverseCharge: document.getElementById('reverseChargeSelect').value === 'yes',
      recipientType: document.getElementById('recipientTypeSelect').value,
    },
    totals: totalsBreakdown,
    einvoice: {
      enabled: document.getElementById('eInvoiceEnabled').checked,
      qr: document.getElementById('irnQr').querySelector('img')?.src || '',
    },
  };
}

function applyInvoiceState(state, options = {}) {
  if (!state) return;
  setDocumentLocked(false);
  applyTemplate(state.template || defaultTemplate);

  Object.entries({ ...wizardCogDefaults, ...state.fields }).forEach(([key, value]) => {
    setPresetField(key, value);
  });

  if (Array.isArray(state.items) && state.items.length) {
    lineItems.innerHTML = "";
    state.items.forEach((item) => addLineItem(item.description, item.qty, item.rate, item.sac || '998313'));
  }

  if (state.logo) {
    setLogo(state.logo);
  } else {
    clearLogo();
  }
  if (state.cover) {
    setCoverImage(state.cover);
  } else {
    clearCoverImage();
  }
  setSignature(state.signature || '');
  setQrImage(state.einvoice?.qr || '');
  document.getElementById('eInvoiceEnabled').checked = Boolean(state.einvoice?.enabled);
  document.getElementById('einvoiceDetails').hidden = !state.einvoice?.enabled;
  document.getElementById('placeOfSupplySelect').value = state.taxSettings?.placeOfSupply || '19';
  document.getElementById('reverseChargeSelect').value = state.taxSettings?.reverseCharge ? 'yes' : 'no';
  document.getElementById('recipientTypeSelect').value = state.taxSettings?.recipientType || 'registered';
  const copySelect = document.getElementById('copyTypeSelect');
  if (copySelect) copySelect.value = getPresetFieldText('copyType') === 'Duplicate for Supplier' ? 'supplier' : 'recipient';
  placeOfSupplyTouched = Boolean(state.taxSettings);
  if (!options.document) {
    currentDocument = null;
    setPresetField('invoiceNumber', 'DRAFT');
    setInvoiceDates();
  } else if (currentDocument?.status === 'draft') {
    // A reopened draft shows today's dates; issued documents keep their stored dates.
    setInvoiceDates();
  }
  calculateTotals();
  renderDocumentState();
}

function refreshPresetSelect() {
  const presets = getPresets();
  presetSelect.innerHTML = '<option value="">Choose a saved preset</option>';
  [documentType, ...presetTypes.filter((type) => type !== documentType)].forEach((type) => {
    const names = presets.filter((preset) => preset.type === type).map((preset) => preset.name).sort();
    if (!names.length) return;
    const group = document.createElement("optgroup");
    group.label = presetTypeLabels[type];
    names.forEach((name) => group.append(new Option(name, presetKey(type, name))));
    presetSelect.appendChild(group);
  });
}

function presetKey(type, name) {
  return `${type}:${name}`;
}

function applyTemplate(template, options = {}) {
  const requestedTemplate = template === "wizardcog" ? "corporate" : template;
  const normalizedTemplate = templateClasses.includes(`template-${requestedTemplate}`)
    ? requestedTemplate
    : defaultTemplate;
  invoicePage.classList.remove(...[...invoicePage.classList].filter((name) => name.startsWith("template-")));
  invoicePage.classList.add(`template-${normalizedTemplate}`);
  if (templateSelect) templateSelect.value = normalizedTemplate;
  if (options.applyDefaults) {
    applyWizardCogDefaults();
  }
}

templateSelect.addEventListener("change", () => {
  applyTemplate(templateSelect.value);
  documentDirty = true;
  setStatus("Design applied");
});

logoUpload.addEventListener("change", (event) => {
  readFileAsDataUrl(event.target.files[0], (src) => {
    setLogo(src);
    documentDirty = true;
    setStatus("Logo added");
  });
});

imageUpload.addEventListener("change", (event) => {
  readFileAsDataUrl(event.target.files[0], (src) => {
    setCoverImage(src);
    documentDirty = true;
    setStatus("Image added");
  });
});

document.getElementById("clearLogo").addEventListener("click", () => {
  clearLogo();
  documentDirty = true;
  setStatus("Logo removed");
});

document.getElementById("clearImage").addEventListener("click", () => {
  clearCoverImage();
  documentDirty = true;
  setStatus("Image removed");
});

document.getElementById("addItem").addEventListener("click", () => {
  addLineItem();
  documentDirty = true;
  setStatus("Line item added");
});

document.getElementById("printInvoice").addEventListener("click", finalizeAndPrint);
document.getElementById('printSignIn').addEventListener('click', () => {
  const email = document.getElementById('cloudEmail');
  email.scrollIntoView({ block: 'center' });
  email.focus({ preventScroll: true });
});
document.getElementById('printDraft').addEventListener('click', () => {
  document.getElementById('printFeedback').hidden = true;
  if (!currentDocument || currentDocument.status === 'draft') setInvoiceDates();
  renderDocumentState();
  document.title = `Draft-${documentType}`;
  window.print();
});

window.addEventListener("afterprint", () => {
  document.title = defaultDocumentTitle;
});

document.getElementById("newInvoice").addEventListener("click", () => {
  window.location.reload();
});

document.getElementById("resetDesign").addEventListener("click", () => {
  applyTemplate(defaultTemplate, { applyDefaults: true });
  clearCoverImage();
  currentDocument = null;
  documentDirty = true;
  renderDocumentState();
  setStatus("Design reset");
});

document.getElementById("savePreset").addEventListener("click", async () => {
  const name = presetName.value.trim();
  if (!name) {
    setStatus("Name the preset first");
    presetName.focus();
    return;
  }

  try {
    const state = collectInvoiceState();
    if (cloud.user) {
      await cloud.savePreset(documentType, name, state);
      await refreshCloudData();
    } else {
      const presets = getLocalPresets();
      presets[name] = state;
      savePresets(presets);
      refreshPresetSelect();
    }
    presetSelect.value = presetKey(documentType, name);
    setStatus(cloud.user ? 'Preset saved to cloud' : 'Preset saved in this browser');
  } catch (error) { showCloudError(error); }
});

presetSelect.addEventListener("change", () => {
  const preset = getPresets().find((entry) => presetKey(entry.type, entry.name) === presetSelect.value);
  if (!preset) return;
  presetName.value = preset.name;
  applyInvoiceState(adaptPresetSnapshot(preset));
  documentDirty = true;
  setStatus(preset.type === documentType ? "Preset loaded" : `${presetTypeLabels[preset.type].replace(/s$/, "")} loaded`);
});

invoicePage.addEventListener("input", (event) => {
  documentDirty = true;
  const presetField = event.target.closest("[data-preset-field]");
  if (presetField) {
    invoicePage
      .querySelectorAll(`[data-preset-field="${presetField.dataset.presetField}"]`)
      .forEach((field) => {
        if (field !== presetField) field.innerHTML = presetField.innerHTML;
      });
  }
  if (presetField?.dataset.presetField === 'clientGstin') syncRecipientGstin();
  calculateTotals();
});
lineItems.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-line");
  if (!button) return;
  if (lineItems.querySelectorAll(".line-item").length === 1) {
    setStatus("Keep at least one item");
    return;
  }
  button.closest(".line-item").remove();
  documentDirty = true;
  calculateTotals();
  setStatus("Line item removed");
});
invoicePage.addEventListener("paste", (event) => {
  if (!event.target.matches('[contenteditable="true"]')) return;
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
});

initializeWorkspace();
refreshPresetSelect();
setPresetField("invoiceNumber", "DRAFT");
setInvoiceDates();
calculateTotals();
loadProformaHandoff();

// A proforma's "Create tax invoice" opens this page with its contents as a fresh draft.
function loadProformaHandoff() {
  if (documentType !== 'invoice') return;
  let handoff;
  try {
    handoff = JSON.parse(sessionStorage.getItem(proformaHandoffKey));
    sessionStorage.removeItem(proformaHandoffKey);
  } catch { return; }
  if (!handoff?.snapshot) return;
  const snapshot = structuredClone(handoff.snapshot);
  snapshot.fields = {
    ...snapshot.fields,
    invoiceType: wizardCogDefaults.invoiceType,
    copyType: wizardCogDefaults.copyType,
    notes: `Against proforma invoice ${handoff.number}. ${wizardCogDefaults.notes}`,
  };
  applyInvoiceState(snapshot);
  documentDirty = true;
  setStatus(`Drafted from ${handoff.number}`);
}

function initializeWorkspace() {
  const workspace = document.createElement('section');
  workspace.className = 'panel cloud-panel';
  workspace.innerHTML = `
    <div class="panel-title"><span>Cloud workspace</span></div>
    <p class="panel-help" id="cloudStatus" role="status">Connecting…</p>
    <form id="cloudSignIn" class="panel-form">
      <label class="field-label" for="cloudEmail">Your email</label>
      <input class="field-input" id="cloudEmail" type="email" autocomplete="email" value="wizardcogofficial@gmail.com" required />
      <button class="primary-button" type="submit">Send sign-in link</button>
    </form>
    <button class="secondary-button" id="cloudSignOut" type="button" hidden>Sign out</button>
    <div id="cloudWorkspace" class="panel-form" hidden>
      <p class="panel-help" id="nextCloudNumber">Next number is assigned on finalization.</p>
      <button class="primary-button" id="saveDraft" type="button">Save draft</button>
      <label class="field-label" for="documentHistory">Saved ${documentLabel}s</label>
      <select class="field-input" id="documentHistory"><option value="">Choose a saved document</option></select>
      <label class="field-label" for="documentStatusSelect">Document status</label>
      <select class="field-input" id="documentStatusSelect" disabled><option value="draft">Draft</option><option value="issued">Issued</option>${isQuotation ? '' : '<option value="paid">Paid</option>'}<option value="cancelled">Cancelled (number kept)</option></select>
      <div id="releaseNumberGroup" class="panel-form" hidden>
        <button class="secondary-button" id="releaseNumber" type="button">Cancel &amp; reuse number</button>
        <p class="panel-help">Printed but never sent to the client? Cancel it here and the next ${documentLabel} you finalize gets this number.</p>
      </div>
      ${isProforma ? '<button class="primary-button" id="convertToInvoice" type="button" hidden>Create tax invoice from this</button>' : ''}
      <button class="secondary-button" id="importLocalPresets" type="button">Import browser presets</button>
    </div>`;
  document.querySelector('.document-nav').after(workspace);

  const gstPanel = document.createElement('section');
  gstPanel.className = 'panel gst-controls';
  const stateOptions = Object.keys(InvoiceGST.states).sort().map(code => `<option value="${code}" ${code === '19' ? 'selected' : ''}>${InvoiceGST.stateLabel(code)}</option>`).join('');
  gstPanel.innerHTML = `
    <div class="panel-title"><span>GST &amp; authorisation</span></div>
    <label class="field-label" for="recipientTypeSelect">Client registration</label>
    <select class="field-input" id="recipientTypeSelect"><option value="registered">GST-registered</option><option value="unregistered">Unregistered (URP)</option><option value="uin">UIN holder</option></select>
    <label class="field-label" for="placeOfSupplySelect">Place of supply</label>
    <select class="field-input" id="placeOfSupplySelect">${stateOptions}</select>
    <label class="field-label" for="reverseChargeSelect">Reverse charge</label>
    <select class="field-input" id="reverseChargeSelect"><option value="no">No</option><option value="yes">Yes — GST paid by recipient</option></select>
    ${isQuotation ? '' : '<label class="field-label" for="copyTypeSelect">Invoice copy</label><select class="field-input" id="copyTypeSelect"><option value="recipient">Original for Recipient</option><option value="supplier">Duplicate for Supplier</option></select>'}
    <label class="upload-card"><input id="signatureUpload" type="file" accept="image/png,image/jpeg" /><span>Add signature</span><small>Your authorised signatory's signature</small></label>
    <button class="secondary-button slim-button" id="clearSignature" type="button">Remove signature</button>
    <button class="secondary-button" id="saveBusinessDefaults" type="button">Save business details</button>
    <details class="gst-extra"><summary>e-Invoice, if applicable</summary><div class="panel-form">
      <label class="checkbox-label"><input id="eInvoiceEnabled" type="checkbox" /> Include IRP details</label>
      <p class="panel-help">Use the IRN, acknowledgement and signed QR returned by your Invoice Registration Portal.</p>
      <label class="upload-card"><input id="qrUpload" type="file" accept="image/png,image/jpeg" /><span>Add signed QR image</span></label>
    </div></details>`;
  document.querySelector('.sidebar .compact-panel').before(gstPanel);

  const eInvoice = document.createElement('section');
  eInvoice.className = 'einvoice-details';
  eInvoice.id = 'einvoiceDetails';
  eInvoice.hidden = true;
  eInvoice.innerHTML = `<div><span>Invoice Reference Number (IRN)</span><strong contenteditable="true" data-preset-field="irn" data-placeholder="64-character IRN from your IRP"></strong><p><span>Acknowledgement</span> <strong contenteditable="true" data-preset-field="ackNumber" data-placeholder="Acknowledgement number"></strong> · <strong contenteditable="true" data-preset-field="ackDate" data-placeholder="YYYY-MM-DD"></strong></p></div><div id="irnQr" class="irn-qr"></div>`;
  document.querySelector('.supply-details').after(eInvoice);

  document.getElementById('cloudSignIn').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await cloud.signIn(document.getElementById('cloudEmail').value.trim());
      document.getElementById('cloudStatus').textContent = 'Check your email and open the sign-in link in this browser.';
    } catch (error) { showCloudError(error); }
    finally { button.disabled = false; }
  });
  document.getElementById('cloudSignOut').addEventListener('click', async () => {
    try { await cloud.signOut(); window.location.reload(); } catch (error) { showCloudError(error); }
  });
  document.getElementById('saveDraft').addEventListener('click', async () => {
    try { await saveCurrentDraft(); await refreshCloudData(); setStatus('Draft saved to cloud'); }
    catch (error) { showCloudError(error); }
  });
  document.getElementById('documentHistory').addEventListener('change', async event => {
    if (!event.target.value) return;
    try {
      if (documentDirty && !window.confirm('Load this document? Save your current draft first if you want to keep these edits.')) return;
      currentDocument = await cloud.document(event.target.value);
      applyInvoiceState(currentDocument.snapshot, { document: true });
      documentDirty = false;
      renderDocumentState();
      setStatus('Document loaded');
    } catch (error) { showCloudError(error); }
  });
  document.getElementById('documentStatusSelect').addEventListener('change', async event => {
    if (!currentDocument || currentDocument.status === 'draft') return;
    try {
      currentDocument = await cloud.setStatus(currentDocument.id, event.target.value);
      renderDocumentState();
      await refreshCloudData();
    } catch (error) { showCloudError(error); renderDocumentState(); }
  });
  document.getElementById('releaseNumber').addEventListener('click', async () => {
    if (!currentDocument || currentDocument.status !== 'issued') return;
    const number = currentDocument.document_number;
    if (!window.confirm(`Cancel ${number} and reuse its number?\n\nOnly do this if it was never sent to the client. The cancelled record stays in history, and ${number} will be assigned to the next ${documentLabel} you finalize.`)) return;
    try {
      currentDocument = await cloud.releaseNumber(currentDocument.id);
      renderDocumentState();
      await refreshCloudData();
      setStatus(`${number} cancelled — number will be reused`);
    } catch (error) { showCloudError(error); renderDocumentState(); }
  });
  document.getElementById('convertToInvoice')?.addEventListener('click', () => {
    if (!currentDocument || currentDocument.status === 'draft') return;
    try {
      sessionStorage.setItem(proformaHandoffKey, JSON.stringify({ number: currentDocument.document_number, snapshot: currentDocument.snapshot }));
    } catch { showCloudError(new Error('This browser blocked the hand-off. Allow site storage and try again.')); return; }
    window.location.href = 'index.html';
  });
  document.getElementById('importLocalPresets').addEventListener('click', async () => {
    try {
      const count = await cloud.importPresets(documentType, getLocalPresets());
      await refreshCloudData();
      setStatus(`${count} browser presets imported`);
    } catch (error) { showCloudError(error); }
  });
  document.getElementById('placeOfSupplySelect').addEventListener('change', () => {
    placeOfSupplyTouched = true;
    documentDirty = true;
    if (document.getElementById('recipientTypeSelect').value === 'unregistered') setPresetField('clientState', InvoiceGST.stateLabel(document.getElementById('placeOfSupplySelect').value));
    calculateTotals();
  });
  document.getElementById('reverseChargeSelect').addEventListener('change', () => { documentDirty = true; calculateTotals(); });
  document.getElementById('recipientTypeSelect').addEventListener('change', event => {
    if (event.target.value === 'unregistered') setPresetField('clientGstin', 'URP');
    else if (getPresetFieldText('clientGstin') === 'URP') setPresetField('clientGstin', '');
    documentDirty = true;
    calculateTotals();
  });
  document.getElementById('copyTypeSelect')?.addEventListener('change', event => {
    setPresetField('copyType', event.target.value === 'supplier' ? 'Duplicate for Supplier' : 'Original for Recipient');
    if (!currentDocument || currentDocument.status === 'draft') documentDirty = true;
  });
  document.getElementById('signatureUpload').addEventListener('change', event => readFileAsDataUrl(event.target.files[0], src => { setSignature(src); documentDirty = true; }));
  document.getElementById('clearSignature').addEventListener('click', () => { setSignature(''); documentDirty = true; });
  document.getElementById('eInvoiceEnabled').addEventListener('change', event => { eInvoice.hidden = !event.target.checked; documentDirty = true; });
  document.getElementById('qrUpload').addEventListener('change', event => readFileAsDataUrl(event.target.files[0], src => { setQrImage(src); documentDirty = true; }));
  document.getElementById('saveBusinessDefaults').addEventListener('click', saveBusinessDefaults);
  cloud.subscribe(handleCloudSession);
  cloud.ready.then(handleCloudSession);
  renderDocumentState();
}

function setSignature(src) {
  const box = document.getElementById('signatureImage');
  box.replaceChildren();
  box.classList.toggle('is-empty', !src);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Authorised signatory signature';
    box.append(img);
  }
}

function setQrImage(src) {
  const box = document.getElementById('irnQr');
  box.replaceChildren();
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Signed QR code supplied by the Invoice Registration Portal';
    box.append(img);
  }
}

function syncRecipientGstin() {
  const gstin = getPresetFieldText('clientGstin').toUpperCase();
  if (gstin === 'URP') document.getElementById('recipientTypeSelect').value = 'unregistered';
  else if (InvoiceGST.validGstin(gstin)) {
    document.getElementById('recipientTypeSelect').value = 'registered';
    setPresetField('clientState', InvoiceGST.stateLabel(gstin.slice(0, 2)));
    if (!placeOfSupplyTouched) document.getElementById('placeOfSupplySelect').value = gstin.slice(0, 2);
  }
}

function showCloudError(error) {
  document.getElementById('cloudStatus').textContent = error.message || 'The operation could not be completed.';
  setStatus('Needs attention');
}

async function handleCloudSession() {
  const user = cloud.user;
  const id = user?.id || null;
  document.getElementById('cloudSignIn').hidden = Boolean(user);
  document.getElementById('cloudSignOut').hidden = !user;
  document.getElementById('cloudWorkspace').hidden = !user;
  document.getElementById('printAuthHint').hidden = Boolean(user);
  document.getElementById('printSignIn').hidden = Boolean(user);
  if (id !== lastCloudUser) document.getElementById('printFeedback').hidden = true;
  document.getElementById('cloudStatus').textContent = cloud.failure || (user ? `Connected as ${user.email}` : 'Sign in to sync presets, save drafts and issue documents.');
  if (id === lastCloudUser) return;
  lastCloudUser = id;
  cloudPresets = null;
  if (!user) { refreshPresetSelect(); return; }
  try {
    const defaults = await cloud.businessSettings();
    if (defaults?.common && !documentDirty && !currentDocument) {
      Object.entries(defaults.common).forEach(([key, value]) => setPresetField(key, value));
      calculateTotals();
    }
    await refreshCloudData();
  } catch (error) { showCloudError(error); }
}

async function refreshCloudData() {
  if (!cloud.user) return;
  const [presets, documents, nextNumber] = await Promise.all([
    cloud.presets(), cloud.documents(documentType), cloud.nextNumber(documentType),
  ]);
  cloudPresets = presets.map(preset => ({ type: preset.document_type, name: preset.name, snapshot: preset.snapshot }));
  refreshPresetSelect();
  const history = document.getElementById('documentHistory');
  history.replaceChildren(new Option('Choose a saved document', ''));
  documents.forEach(doc => history.add(new Option(`${doc.document_number || 'Draft'} · ${doc.client_name || 'Unnamed client'} · ${doc.number_released_at ? 'cancelled, number reused' : doc.status}`, doc.id)));
  if (currentDocument) history.value = currentDocument.id;
  const reusing = nextNumber && documents.some(doc => doc.number_released_at && doc.document_number === nextNumber);
  document.getElementById('nextCloudNumber').textContent = nextNumber
    ? `Next: ${nextNumber}${reusing ? ' (reused from a cancelled document)' : ''}`
    : 'A new numbering series will start when you finalize your first document.';
}

async function saveBusinessDefaults() {
  try {
    if (!InvoiceGST.validGstin(getPresetFieldText('supplierGstin'))) throw new Error('Enter a valid supplier GSTIN before saving business details.');
    const keys = ['brandName', 'brandLabel', 'senderName', 'senderAddress', 'supplierGstin', 'supplierState', 'supportEmail', 'phoneNumber', 'domain', 'footerMessage', 'signatoryName'];
    const existing = await cloud.businessSettings() || {};
    existing.common = Object.fromEntries(keys.map(key => [key, invoicePage.querySelector(`[data-preset-field="${key}"]`)?.innerHTML || '']));
    await cloud.saveBusinessSettings(existing);
    setStatus('Business details saved');
  } catch (error) { showCloudError(error); }
}

function validateDocument() {
  for (const [field, label] of [['senderName', 'Supplier legal name'], ['senderAddress', 'Supplier address'], ['clientName', 'Client legal name'], ['clientAddress', 'Client address']]) {
    if (!getPresetFieldText(field)) throw new Error(`${label} is required.`);
  }
  if (!InvoiceGST.validGstin(getPresetFieldText('supplierGstin'))) throw new Error('The supplier GSTIN is missing or has an invalid format/checksum.');
  const recipientType = document.getElementById('recipientTypeSelect').value;
  const gstin = getPresetFieldText('clientGstin').toUpperCase();
  if (documentType === 'invoice' && recipientType === 'registered' && !InvoiceGST.validGstin(gstin)) throw new Error('Enter the client’s GSTIN, or select Unregistered (URP).');
  if (documentType === 'invoice' && recipientType === 'uin' && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) throw new Error('Enter the recipient’s 15-character UIN.');
  if (!InvoiceGST.states[document.getElementById('placeOfSupplySelect').value]) throw new Error('Choose the place of supply.');
  for (const row of lineItems.querySelectorAll('.line-item')) {
    if (!row.querySelector('[data-item-description]').textContent.trim()) throw new Error('Each service needs a description.');
    if (!/^\d{6}$/.test(row.querySelector('[data-item-sac]').textContent.trim())) throw new Error('Enter a six-digit SAC for each service.');
    const numeric = kind => row.querySelector(`[data-number="${kind}"]`).textContent.replace(/[₹,\s]/g, '');
    if (!/^\d+(\.\d+)?$/.test(numeric('qty')) || !/^\d+(\.\d+)?$/.test(numeric('rate')) || Number(numeric('qty')) <= 0) throw new Error('Enter valid positive quantities and non-negative rates.');
  }
  if (document.getElementById('eInvoiceEnabled').checked) {
    if (!/^[a-f0-9]{64}$/i.test(getPresetFieldText('irn')) || !/^\d{15}$/.test(getPresetFieldText('ackNumber')) || !/^\d{4}-\d{2}-\d{2}$/.test(getPresetFieldText('ackDate')) || !document.getElementById('irnQr').querySelector('img')) throw new Error('Complete the IRN, acknowledgement, date and signed QR from your IRP.');
  }
}

async function saveCurrentDraft() {
  if (draftSave) return draftSave;
  if (!cloud.user) throw new Error('Sign in to save this document to the cloud.');
  if (currentDocument && currentDocument.status !== 'draft') throw new Error('Issued documents are locked. Start a new document to make changes.');
  calculateTotals();
  const snapshot = collectInvoiceState();
  draftSave = cloud.saveDraft(currentDocument?.id || null, documentType, getPresetFieldText('clientName'), snapshot)
    .then(doc => {
      currentDocument = doc;
      documentDirty = JSON.stringify(snapshot) !== JSON.stringify(collectInvoiceState());
      renderDocumentState();
      return doc;
    }).finally(() => { draftSave = null; });
  return draftSave;
}

function setDocumentLocked(locked) {
  invoicePage.querySelectorAll('[contenteditable]').forEach(field => { field.contentEditable = String(!locked); });
  invoicePage.querySelectorAll('.remove-line').forEach(button => { button.disabled = locked; });
  for (const id of ['templateSelect', 'resetDesign', 'addItem', 'logoUpload', 'imageUpload', 'clearLogo', 'clearImage', 'signatureUpload', 'clearSignature', 'placeOfSupplySelect', 'reverseChargeSelect', 'recipientTypeSelect', 'eInvoiceEnabled', 'qrUpload', 'saveDraft', 'printDraft']) {
    const control = document.getElementById(id);
    if (control) control.disabled = locked;
  }
}

function renderDocumentState() {
  const issued = currentDocument && currentDocument.status !== 'draft';
  setDocumentLocked(Boolean(issued || isFinalizing));
  invoicePage.classList.toggle('is-draft', !issued);
  invoicePage.dataset.watermark = isQuotation ? 'DRAFT QUOTATION' : isProforma ? 'DRAFT PROFORMA' : 'DRAFT · NOT A TAX INVOICE';
  document.getElementById('printInvoice').textContent = isFinalizing ? 'Finalizing…' : issued ? 'Reprint / Save PDF' : 'Finalize & Print';
  const status = document.getElementById('documentStatusSelect');
  const released = Boolean(currentDocument?.number_released_at);
  if (status) { status.value = currentDocument?.status || 'draft'; status.disabled = !issued || released; }
  document.getElementById('releaseNumberGroup').hidden = currentDocument?.status !== 'issued' || Boolean(currentDocument?.snapshot?.einvoice?.enabled);
  const convert = document.getElementById('convertToInvoice');
  if (convert) convert.hidden = !issued || currentDocument.status === 'cancelled';
  if (issued) {
    setPresetField('invoiceNumber', currentDocument.document_number);
    const labels = { issued: isQuotation ? 'Issued' : isProforma ? 'Awaiting payment' : 'Unpaid', paid: 'Paid', cancelled: 'Cancelled' };
    setPresetField('invoiceStatus', labels[currentDocument.status]);
  } else setPresetField('invoiceStatus', 'Draft');
}

async function finalizeAndPrint() {
  const button = document.getElementById('printInvoice');
  const feedback = document.getElementById('printFeedback');
  feedback.hidden = true;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    await cloud.ready;
    if (!cloud.user) throw new Error(cloud.failure || 'Sign in to finalize this document. You can use Print draft without signing in.');
    if (currentDocument?.id && currentDocument.status === 'draft') {
      const saved = await cloud.document(currentDocument.id);
      if (saved.status !== 'draft') {
        currentDocument = saved;
        applyInvoiceState(saved.snapshot, { document: true });
        documentDirty = false;
      }
    }
    if (!currentDocument || currentDocument.status === 'draft') {
      validateDocument();
      isFinalizing = true;
      renderDocumentState();
      await saveCurrentDraft();
      currentDocument = await cloud.finalize(currentDocument.id);
      applyInvoiceState(currentDocument.snapshot, { document: true });
      documentDirty = false;
      renderDocumentState();
    }
    try { await refreshCloudData(); }
    catch (error) { showCloudError(new Error(`Document saved. History could not refresh: ${error.message}`)); }
    document.title = cleanInvoiceFileName(currentDocument.document_number);
    calculateTotals();
    window.print();
  } catch (error) {
    showCloudError(error);
    document.getElementById('printFeedbackMessage').textContent = error.message || 'Printing could not start. Please try again.';
    document.getElementById('printSignIn').hidden = Boolean(cloud.user || cloud.failure);
    feedback.hidden = false;
    feedback.scrollIntoView({ block: 'nearest' });
    feedback.focus({ preventScroll: true });
  }
  finally { isFinalizing = false; renderDocumentState(); button.disabled = false; }
}
