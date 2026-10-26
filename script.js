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
const gstRate = 0.18;
const isQuotation = document.body.dataset.documentType === "quotation";
const documentType = isQuotation ? "quotation" : "invoice";
const documentNumberPrefix = isQuotation ? "WC-Q" : "WC";
const storageKey = `${documentType}-studio-presets`;
const invoiceSequenceKey = `${documentType}-studio-wizardcog-sequence`;
const wizardCogLogo = "assets/wizardcoglogo-transparent-cropped.png";
let invoiceNumberManuallyEdited = false;
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
  invoiceType: isQuotation ? "Quotation" : "Invoice",
  invoiceNumber: isQuotation ? "#WC-Q-2026-0001" : "#WC-2026-014",
  invoiceStatus: isQuotation ? "Draft" : "Unpaid",
  senderName: "WizardCog",
  senderAddress: "Om Residency, Block - 1, Flat - 7A, 83A, Cossipore Road, Kolkata - 700002",
  notes: isQuotation
    ? "Thank you for considering WizardCog. This quotation is valid for 15 days from the issue date. Please contact us to confirm acceptance."
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

function currentInvoiceYear() {
  return new Date().getFullYear();
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

function buildInvoiceNumber(year, sequence) {
  return `#${documentNumberPrefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

function getInvoiceSequence() {
  const fallback = { year: currentInvoiceYear(), next: 1 };
  try {
    const stored = JSON.parse(localStorage.getItem(invoiceSequenceKey));
    if (!stored || stored.year !== fallback.year || !Number.isFinite(Number(stored.next))) {
      return fallback;
    }
    return { year: stored.year, next: Math.max(1, Number(stored.next)) };
  } catch {
    return fallback;
  }
}

function peekNextInvoiceNumber() {
  const sequence = getInvoiceSequence();
  return buildInvoiceNumber(sequence.year, sequence.next);
}

function claimNextInvoiceNumber() {
  const sequence = getInvoiceSequence();
  const invoiceNumber = buildInvoiceNumber(sequence.year, sequence.next);
  try {
    localStorage.setItem(
      invoiceSequenceKey,
      JSON.stringify({ year: sequence.year, next: sequence.next + 1 }),
    );
  } catch {
    // If storage is unavailable, the timestamp keeps printed invoice numbers distinct.
    return `#${documentNumberPrefix}-${sequence.year}-${Date.now()}`;
  }
  return invoiceNumber;
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
    const lineTotalPaise = Math.round(qty * rate * 100);
    row.querySelector(".line-total").textContent = formatCurrency(lineTotalPaise / 100);
    subtotalPaise += lineTotalPaise;
  });

  const taxPaise = Math.round(subtotalPaise * gstRate);
  subtotal.textContent = formatCurrency(subtotalPaise / 100);
  taxAmount.textContent = formatCurrency(taxPaise / 100);
  grandTotal.textContent = formatCurrency((subtotalPaise + taxPaise) / 100);
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
    field.innerHTML = value;
  });
}

function getPresetFieldText(name) {
  return invoicePage.querySelector(`[data-preset-field="${name}"]`)?.textContent.trim() || "";
}

function applyWizardCogDefaults() {
  Object.entries(wizardCogDefaults).forEach(([key, value]) => setPresetField(key, value));
  setPresetField("invoiceNumber", peekNextInvoiceNumber());
  invoiceNumberManuallyEdited = false;
  setInvoiceDates();
  presetName.value = `${templateSelect.selectedOptions[0].textContent.split(" - ")[0]} Default`;
  setLogo(wizardCogLogo);
  clearCoverImage();
}

function addLineItem(description = "New service", qty = "1", rate = "0") {
  const row = document.createElement("div");
  row.className = "line-item";
  row.innerHTML = `
    <div contenteditable="true">${description}</div>
    <div contenteditable="true" data-number="qty">${qty}</div>
    <div contenteditable="true" data-number="rate">${rate}</div>
    <div class="line-total">₹0</div>
    <button class="remove-line" type="button" aria-label="Remove line item">&times;</button>
  `;
  lineItems.appendChild(row);
  calculateTotals();
}

function getPresets() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
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
    description: row.children[0].innerHTML,
    qty: row.querySelector('[data-number="qty"]').innerHTML,
    rate: row.querySelector('[data-number="rate"]').innerHTML,
  }));

  return {
    template: invoicePage.className.match(/template-\w+/)?.[0]?.replace("template-", "") || defaultTemplate,
    fields,
    items,
    logo: logoBox.querySelector("img")?.src || "",
    cover: imageStrip.querySelector("img")?.src || "",
  };
}

function applyInvoiceState(state) {
  if (!state) return;
  applyTemplate(state.template || defaultTemplate);
  invoiceNumberManuallyEdited = false;

  Object.entries(state.fields || {}).forEach(([key, value]) => {
    setPresetField(key, value);
  });

  if (Array.isArray(state.items) && state.items.length) {
    lineItems.innerHTML = "";
    state.items.forEach((item) => addLineItem(item.description, item.qty, item.rate));
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
  calculateTotals();
}

function refreshPresetSelect() {
  const presets = getPresets();
  presetSelect.innerHTML = '<option value="">Choose a saved preset</option>';
  Object.keys(presets)
    .sort()
    .forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      presetSelect.appendChild(option);
    });
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
  applyTemplate(templateSelect.value, { applyDefaults: templateSelect.value === "corporate" });
  setStatus("Design applied");
});

logoUpload.addEventListener("change", (event) => {
  readFileAsDataUrl(event.target.files[0], (src) => {
    setLogo(src);
    setStatus("Logo added");
  });
});

imageUpload.addEventListener("change", (event) => {
  readFileAsDataUrl(event.target.files[0], (src) => {
    setCoverImage(src);
    setStatus("Image added");
  });
});

document.getElementById("clearLogo").addEventListener("click", () => {
  clearLogo();
  setStatus("Logo removed");
});

document.getElementById("clearImage").addEventListener("click", () => {
  clearCoverImage();
  setStatus("Image removed");
});

document.getElementById("addItem").addEventListener("click", () => {
  addLineItem();
  setStatus("Line item added");
});

document.getElementById("printInvoice").addEventListener("click", () => {
  const currentInvoiceNumber = getPresetFieldText("invoiceNumber");
  const invoiceNumber = invoiceNumberManuallyEdited
    ? currentInvoiceNumber || peekNextInvoiceNumber()
    : claimNextInvoiceNumber();
  setPresetField("invoiceNumber", invoiceNumber);
  setInvoiceDates();
  document.title = cleanInvoiceFileName(invoiceNumber);
  calculateTotals();
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
  setStatus("Design reset");
});

document.getElementById("savePreset").addEventListener("click", () => {
  const name = presetName.value.trim();
  if (!name) {
    setStatus("Name the preset first");
    presetName.focus();
    return;
  }

  const presets = getPresets();
  presets[name] = collectInvoiceState();
  savePresets(presets);
  refreshPresetSelect();
  presetSelect.value = name;
  setStatus("Preset saved");
});

presetSelect.addEventListener("change", () => {
  const presets = getPresets();
  const state = presets[presetSelect.value];
  if (!state) return;
  presetName.value = presetSelect.value;
  applyInvoiceState(state);
  setStatus("Preset loaded");
});

invoicePage.addEventListener("input", (event) => {
  const presetField = event.target.closest("[data-preset-field]");
  if (presetField) {
    if (presetField.dataset.presetField === "invoiceNumber") {
      invoiceNumberManuallyEdited = true;
    }
    invoicePage
      .querySelectorAll(`[data-preset-field="${presetField.dataset.presetField}"]`)
      .forEach((field) => {
        if (field !== presetField) field.innerHTML = presetField.innerHTML;
      });
  }
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
  calculateTotals();
  setStatus("Line item removed");
});
invoicePage.addEventListener("paste", (event) => {
  if (!event.target.matches('[contenteditable="true"]')) return;
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
});

refreshPresetSelect();
setPresetField("invoiceNumber", peekNextInvoiceNumber());
setInvoiceDates();
calculateTotals();
