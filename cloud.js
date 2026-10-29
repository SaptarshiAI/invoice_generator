(function () {
  let client;
  let session;
  let failure = '';
  const listeners = new Set();
  function notify() { listeners.forEach((listener) => listener()); }
  const ready = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(async ({ createClient }) => {
      const config = window.invoiceCloudConfig;
      client = createClient(config.url, config.publishableKey);
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
      client.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession;
        window.setTimeout(notify, 0);
      });
    })
    .catch(() => { failure = 'Cloud connection unavailable. Your unsaved document remains in this tab.'; })
    .finally(notify);

  async function connection() {
    await ready;
    if (!client) throw new Error(failure || 'Cloud connection unavailable.');
    if (!session) throw new Error('Sign in to save or issue documents.');
    return client;
  }
  function unwrap(result) {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  function one(data) { return Array.isArray(data) ? data[0] : data; }

  window.invoiceCloud = {
    ready,
    get user() { return session?.user || null; },
    get failure() { return failure; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async signIn(email) {
      if (email.toLowerCase() !== window.invoiceCloudConfig.allowedEmail) throw new Error('Use the approved WizardCog email address for this private workspace.');
      await ready;
      if (!client) throw new Error(failure);
      unwrap(await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}${location.pathname}` },
      }));
    },
    async signOut() { unwrap(await (await connection()).auth.signOut()); },
    async presets() {
      return unwrap(await (await connection()).from('client_presets')
        .select('document_type,name,snapshot').order('name'));
    },
    async savePreset(type, name, snapshot) {
      return unwrap(await (await connection()).from('client_presets').upsert({
        owner_id: session.user.id, document_type: type, name, snapshot,
      }, { onConflict: 'owner_id,document_type,name' }));
    },
    async importPresets(type, presets) {
      const db = await connection();
      const rows = Object.entries(presets).map(([name, snapshot]) => ({
        owner_id: session.user.id, document_type: type, name, snapshot,
      }));
      if (rows.length) unwrap(await db.from('client_presets')
        .upsert(rows, { onConflict: 'owner_id,document_type,name', ignoreDuplicates: true }));
      return rows.length;
    },
    async documents(type) {
      return unwrap(await (await connection()).from('documents')
        .select('id,client_name,status,document_number,number_released_at,created_at')
        .eq('document_type', type).order('created_at', { ascending: false }).limit(200));
    },
    async document(id) {
      return unwrap(await (await connection()).from('documents').select('*').eq('id', id).single());
    },
    async saveDraft(id, type, clientName, snapshot) {
      const db = await connection();
      const values = { document_type: type, client_name: clientName, snapshot };
      const query = id
        ? db.from('documents').update(values).eq('id', id).eq('status', 'draft')
        : db.from('documents').insert(values);
      return unwrap(await query.select().single());
    },
    async finalize(id) {
      return one(unwrap(await (await connection()).rpc('finalize_document', { p_document_id: id })));
    },
    async setStatus(id, status) {
      return one(unwrap(await (await connection()).rpc('set_document_status', {
        p_document_id: id, p_status: status,
      })));
    },
    async releaseNumber(id) {
      return one(unwrap(await (await connection()).rpc('release_document_number', { p_document_id: id })));
    },
    async nextNumber(type) {
      return unwrap(await (await connection()).rpc('next_document_number', { p_document_type: type }));
    },
    async saveBusinessSettings(settings) {
      unwrap(await (await connection()).from('business_settings')
        .upsert({ owner_id: session.user.id, settings }));
    },
    async businessSettings() {
      return unwrap(await (await connection()).from('business_settings')
        .select('settings').maybeSingle())?.settings;
    },
  };
})();
