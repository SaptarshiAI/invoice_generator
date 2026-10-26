// Uses an isolated browser and a fake cloud adapter; never issues real invoices.
// Run with Playwright available: node tests/cloud-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.INVOICE_TEST_URL || 'http://127.0.0.1:5173';
const adapter = `(() => {
  const key = 'cloud-browser-fixtures';
  const read = () => JSON.parse(localStorage.getItem(key) || '{"docs":[],"presets":{},"next":583721,"saves":0,"finalizes":0}');
  const write = state => localStorage.setItem(key, JSON.stringify(state));
  const copy = value => JSON.parse(JSON.stringify(value));
  window.__cloudTest = { read, write };
  window.invoiceCloud = {
    ready: Promise.resolve(), get user() { return read().signedOut ? null : {id:'test-owner', email:'wizardcogofficial@gmail.com'}; }, failure:'',
    subscribe() {}, async businessSettings() { return null; },
    async presets() { return Object.entries(read().presets).map(([name,snapshot]) => ({name,snapshot})); },
    async documents() {
      const state=read();
      if(state.failRefresh) { state.failRefresh=false; write(state); throw Error('Simulated refresh failure'); }
      return state.docs;
    },
    async sequence() { return {series_code:'A7F3',next_number:read().next}; },
    async document(id) { return copy(read().docs.find(doc=>doc.id===id)); },
    async saveDraft(id,type,client_name,snapshot) {
      const state=read(); state.saves++;
      let doc=state.docs.find(doc=>doc.id===id);
      if(doc && doc.status!=='draft') throw Error('Issued document cannot be edited');
      if(!doc) { doc={id:'doc-'+(state.docs.length+1),status:'draft',created_at:'2026-05-01'}; state.docs.push(doc); }
      Object.assign(doc,{document_type:type,client_name,snapshot:copy(snapshot)});
      write(state); return copy(doc);
    },
    async finalize(id) {
      const state=read(); state.finalizes++;
      const doc=state.docs.find(doc=>doc.id===id);
      if(doc.status==='draft') {
        doc.status='issued'; doc.document_number=(doc.document_type==='quotation'?'WCQ':'WC')+'-A7F3-'+state.next++;
        Object.assign(doc.snapshot.fields,{invoiceNumber:doc.document_number,issueDate:'May 1, 2026',dueDate:'May 16, 2026'});
        doc.issue_date='2026-05-01'; doc.due_date='2026-05-16';
      }
      const lost=state.loseResponse; state.loseResponse=false; write(state);
      if(lost) throw Error('Simulated lost finalization response');
      return copy(doc);
    },
    async setStatus(id,status) { const state=read(); const doc=state.docs.find(d=>d.id===id); doc.status=status; write(state); return copy(doc); },
    async savePreset(type,name,snapshot) { const state=read();state.presets[name]=snapshot;write(state); }
  };
})();`;
(async () => {
  const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try {
    for(const type of ['invoice','quotation']) {
      const context=await browser.newContext();
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      await page.route('**/cloud.js',route=>route.fulfill({contentType:'application/javascript',body:adapter}));
      await page.addInitScript(()=>{window.__prints=0;window.print=()=>{window.__prints++;};});
      const open=async()=>{await page.goto(base+'/'+(type==='invoice'?'index':'quotation')+'.html');await page.locator('#nextCloudNumber').filter({hasText:'583721'}).waitFor();};
      await open();
      if(type==='invoice') {
        await page.click('#printInvoice');
        await page.locator('#printFeedbackMessage').filter({hasText:'Enter the client’s GSTIN'}).waitFor();
        assert.equal(await page.locator('#printFeedback').isVisible(),true);
        assert.equal(await page.locator('#printSignIn').isVisible(),false);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'printFeedback');
        assert.deepEqual(await page.evaluate(()=>({prints:window.__prints,finalizes:window.__cloudTest.read().finalizes})),{prints:0,finalizes:0});
      }
      await page.selectOption('#recipientTypeSelect','unregistered');
      await page.locator('[data-preset-field="clientName"]').fill('Workflow test client');
      await page.click('#saveDraft');
      await page.waitForFunction(()=>window.__cloudTest.read().saves===1);
      assert.equal(await page.locator('[data-preset-field="invoiceNumber"]').first().textContent(),'DRAFT');
      assert.equal(await page.evaluate(()=>window.__cloudTest.read().next),583721);
      await open();
      await page.selectOption('#documentHistory','doc-1');
      await page.waitForFunction(()=>document.querySelector('[data-preset-field="clientName"]').textContent==='Workflow test client');
      await page.click('#printInvoice');
      await page.waitForFunction(()=>window.__prints===1);
      const expected=(type==='invoice'?'WC':'WCQ')+'-A7F3-583721';
      assert.equal(await page.locator('[data-preset-field="invoiceNumber"]').first().textContent(),expected);
      assert.equal(await page.locator('[data-preset-field="issueDate"]').first().textContent(),'May 1, 2026');
      assert.equal(await page.locator('[data-preset-field="clientName"]').getAttribute('contenteditable'),'false');
      assert.equal(await page.locator('#templateSelect').isDisabled(),true);
      if(type==='invoice') {
        await page.selectOption('#copyTypeSelect','supplier');
        assert.equal(await page.locator('[data-preset-field="copyType"]').textContent(),'Duplicate for Supplier');
      }
      await page.click('#printInvoice');
      await page.waitForFunction(()=>window.__prints===2);
      assert.deepEqual(await page.evaluate(()=>({next:window.__cloudTest.read().next,finalizes:window.__cloudTest.read().finalizes})),{next:583722,finalizes:1});
      assert.equal(await page.locator('[data-preset-field="issueDate"]').first().textContent(),'May 1, 2026');
      await page.selectOption('#documentStatusSelect','cancelled');
      await page.waitForFunction(()=>window.__cloudTest.read().docs[0].status==='cancelled');
      assert.equal(await page.locator('[data-preset-field="clientName"]').getAttribute('contenteditable'),'false');
      // Loading a preset starts a fresh draft; old issued numbers/dates never carry over.
      await page.evaluate(()=>{
        const state=window.__cloudTest.read();
        const preset=structuredClone(state.docs[0].snapshot);
        preset.fields.clientName='<img src=x onerror="window.__xss=true"><b onclick="window.__xss=true">Safe client</b>';
        preset.items[0].description='<svg onload="window.__xss=true"></svg>Safe service';
        state.presets['Saved client']=preset;window.__cloudTest.write(state);
      });
      await page.reload();
      await page.locator('#presetSelect option[value="Saved client"]').waitFor({state:'attached'});
      await page.selectOption('#presetSelect','Saved client');
      assert.equal(await page.locator('[data-preset-field="invoiceNumber"]').first().textContent(),'DRAFT');
      assert.equal(await page.locator('[data-preset-field="clientName"]').getAttribute('contenteditable'),'true');
      assert.equal(await page.locator('[data-preset-field="clientName"] img, [data-preset-field="clientName"] [onclick], [data-item-description] svg').count(),0);
      assert.equal(await page.evaluate(()=>Boolean(window.__xss)),false);
      // An issued record must still print if refreshing history fails afterwards.
      await page.evaluate(()=>{const state=window.__cloudTest.read();state.failRefresh=true;window.__cloudTest.write(state);});
      await page.click('#printInvoice');
      await page.waitForFunction(()=>window.__prints===1);
      assert.equal(await page.evaluate(()=>window.__cloudTest.read().next),583723);
      assert.match(await page.locator('#cloudStatus').textContent(),/Document saved.*History could not refresh/);
      // Recover a committed invoice after the finalization response was lost.
      await page.selectOption('#presetSelect','Saved client');
      await page.evaluate(()=>{const state=window.__cloudTest.read();state.loseResponse=true;window.__cloudTest.write(state);});
      await page.click('#printInvoice');
      await page.locator('#cloudStatus').filter({hasText:'lost finalization response'}).waitFor();
      const beforeRetry=await page.evaluate(()=>window.__cloudTest.read());
      await page.click('#printInvoice');
      await page.waitForFunction(()=>window.__prints===2);
      const afterRetry=await page.evaluate(()=>window.__cloudTest.read());
      assert.equal(afterRetry.next,beforeRetry.next);
      assert.equal(afterRetry.finalizes,beforeRetry.finalizes);
      assert.equal(afterRetry.saves,beforeRetry.saves);
      assert.equal(await page.locator('[data-preset-field="issueDate"]').first().textContent(),'May 1, 2026');
      assert.match(await page.locator('#nextCloudNumber').textContent(),new RegExp(String(afterRetry.next)));
      // A signed-out final print explains the blocker at the clicked button.
      await page.evaluate(()=>{const state=window.__cloudTest.read();state.signedOut=true;window.__cloudTest.write(state);});
      await page.reload();
      await page.locator('#cloudSignIn').waitFor({state:'visible'});
      await page.click('#printInvoice');
      await page.locator('#printFeedbackMessage').filter({hasText:'Sign in to finalize'}).waitFor();
      assert.equal(await page.locator('#printSignIn').isVisible(),true);
      const feedbackBounds=await page.locator('#printFeedback').boundingBox();
      assert.ok(feedbackBounds.y>=0 && feedbackBounds.y+feedbackBounds.height<=page.viewportSize().height+1,'Print error should be visible beside the print controls');
      assert.equal(await page.evaluate(()=>window.__prints),0);
      assert.equal(await page.evaluate(()=>window.__cloudTest.read().next),afterRetry.next);
      await page.click('#printSignIn');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'cloudEmail');
      await page.click('#printDraft');
      assert.equal(await page.evaluate(()=>window.__prints),1);
      assert.equal(await page.locator('#printFeedback').isVisible(),false);
      assert.equal(await page.evaluate(()=>window.__cloudTest.read().next),afterRetry.next);
      assert.deepEqual(errors,[]);
      console.log(type+': print blockers, sign-in shortcut, draft printing, finalize once, immutable records, presets and lost-response recovery passed');
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
