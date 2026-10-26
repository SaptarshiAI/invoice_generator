const test = require('node:test');
const assert = require('node:assert/strict');
const gst = require('../gst.js');

test('decimal line values round to paise consistently with the database', () => {
  assert.equal(gst.lineTotalPaise('1', '1.005'), 101);
  assert.equal(gst.lineTotalPaise('1.5', '0.67'), 101);
  assert.equal(gst.lineTotalPaise('2', '12000'), 2400000);
  assert.equal(gst.lineTotalPaise('0.125', '2.56'), 32);
});

test('accepts the supplied GSTIN and rejects a changed checksum or state', () => {
  assert.equal(gst.validGstin('19AAFFW5069E1ZV'), true);
  assert.equal(gst.validGstin('19AAFFW5069E1ZA'), false);
  assert.equal(gst.validGstin('00AAFFW5069E1ZV'), false);
  assert.equal(gst.validGstin('URP'), false);
});

test('domestic intra-state service splits 18% into two components', () => {
  assert.deepEqual(gst.breakdown(13400000, '19', '19'), {
    subtotalPaise: 13400000, gstPaise: 2412000, interstate: false,
    cgstPaise: 1206000, sgstPaise: 1206000, igstPaise: 0, totalPaise: 15812000,
  });
});

test('inter-state service charges IGST without CGST or SGST', () => {
  assert.deepEqual(gst.breakdown(1000000, '19', '29'), {
    subtotalPaise: 1000000, gstPaise: 180000, interstate: true,
    cgstPaise: 0, sgstPaise: 0, igstPaise: 180000, totalPaise: 1180000,
  });
});

test('reverse-charge GST is disclosed but excluded from the amount payable to supplier', () => {
  const result = gst.breakdown(1000000, '19', '19', true);
  assert.equal(result.gstPaise, 180000);
  assert.equal(result.totalPaise, 1000000);
});

test('paise components add up exactly to the displayed GST', () => {
  const result = gst.breakdown(6, '19', '19');
  assert.equal(result.gstPaise, 1);
  assert.equal(result.cgstPaise + result.sgstPaise, 1);
  assert.equal(result.totalPaise, 7);
  assert.equal(gst.breakdown(0, '19', '19').gstPaise, 0);
});
