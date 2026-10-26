(function (root) {
  const states = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
    '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
    '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
    '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
    '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
    '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
    '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
    '38': 'Ladakh', '97': 'Other Territory',
  };

  function validGstin(input) {
    const value = String(input).trim().toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value) || !states[value.slice(0, 2)]) return false;
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let factor = 2;
    let sum = 0;
    for (let i = 13; i >= 0; i -= 1) {
      const product = chars.indexOf(value[i]) * factor;
      sum += Math.floor(product / 36) + product % 36;
      factor = factor === 2 ? 1 : 2;
    }
    return chars[(36 - sum % 36) % 36] === value[14];
  }

  function stateLabel(code) {
    return states[code] ? `${states[code]} (${code})` : '';
  }

  // Match PostgreSQL numeric rounding for decimal quantities/rates (e.g. 1.005).
  function lineTotalPaise(quantity, rate) {
    const values = [quantity, rate].map(value => String(value));
    if (!values.every(value => /^-?\d+(\.\d+)?$/.test(value))) return Math.round(Number(quantity) * Number(rate) * 100);
    const decimals = values.map(value => (value.split('.')[1] || '').length);
    const product = values.reduce((total, value) => total * BigInt(value.replace('.', '')), 1n) * 100n;
    const divisor = 10n ** BigInt(decimals[0] + decimals[1]);
    const magnitude = product < 0n ? -product : product;
    return Number((magnitude + divisor / 2n) / divisor) * (product < 0n ? -1 : 1);
  }

  function breakdown(subtotalPaise, supplierState, supplyState, reverseCharge = false) {
    const gstPaise = Math.round(subtotalPaise * 0.18);
    const interstate = supplierState !== supplyState;
    const cgstPaise = interstate ? 0 : Math.round(gstPaise / 2);
    return {
      subtotalPaise, gstPaise, interstate, cgstPaise,
      sgstPaise: interstate ? 0 : gstPaise - cgstPaise,
      igstPaise: interstate ? gstPaise : 0,
      totalPaise: subtotalPaise + (reverseCharge ? 0 : gstPaise),
    };
  }

  const api = { states, validGstin, stateLabel, lineTotalPaise, breakdown };
  root.InvoiceGST = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
