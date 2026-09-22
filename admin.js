/* ParcelQuery private admin client. Database writes are enforced by Supabase RLS. */
const SUPABASE_URL = 'https://mticzeipgnyhefwspiuq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Rjr6Y-LYLs5VHJtMoU_efw_o-bbRb_7';
const ADMIN_UID = '5f6c3796-9812-4363-b4c9-6bee2325b0fb';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function showError(message) { alert(message); }
async function getAdminSession() {
  const { data: { session } } = await db.auth.getSession();
  return session && session.user && session.user.id === ADMIN_UID ? session : null;
}
async function openAdminDashboard() {
  const session = await getAdminSession();
  if (!session) { $('login').classList.remove('hidden'); $('admin').classList.add('hidden'); return; }
  $('login').classList.add('hidden'); $('admin').classList.remove('hidden'); await render(); await renderAnalytics();
}
$('loginBtn').onclick = async () => {
  const email = $('user').value.trim(), password = $('pass').value;
  if (!email || !password) return showError('Enter your admin email and password.');
  const { data, error } = await db.auth.signInWithPassword({email, password});
  if (error) return showError(error.message || 'Sign in failed.');
  if (!data.user || data.user.id !== ADMIN_UID) { await db.auth.signOut(); return showError('This account is not authorized for the ParcelQuery admin area.'); }
  $('pass').value = ''; await openAdminDashboard();
};
$('logout').onclick = async () => { await db.auth.signOut(); await openAdminDashboard(); };

async function renderAnalytics() {
  const summary = $('analyticsSummary');
  const table = $('visitorTable');
  if (!summary || !table) return;

  summary.innerHTML = '<p>Loading visitor activity...</p>';
  const { data: visits, error } = await db.from('page_visits').select('*').order('created_at', {ascending:false}).limit(200);
  if (error) {
    summary.innerHTML = '<p>Analytics could not be loaded: ' + esc(error.message) + '</p>';
    table.innerHTML = '';
    return;
  }

  const a = visits || [];
  const start = new Date();
  start.setHours(0,0,0,0);
  const today = a.filter(x => new Date(x.created_at) >= start).length;
  const support = a.filter(x => x.event_type === 'support_click').length;

  if ($('vTotal')) $('vTotal').firstChild.textContent = a.length;
  if ($('vToday')) $('vToday').firstChild.textContent = today;
  if ($('vSupport')) $('vSupport').firstChild.textContent = support;

  summary.innerHTML = '<p>Showing the latest ' + a.length + ' activity records.</p>';
  table.innerHTML = a.map(x => {
    const place = [x.city, x.region, x.country].filter(Boolean).join(', ') || 'Location unavailable';
    return `<div class="event visitor-event">
      <div><b>${esc(x.event_type === 'support_click' ? 'Support click' : 'Page visit')}</b>
      <small>${esc(formatAdminDate(x.created_at))} · ${esc(x.page_path || '/')} · ${esc(x.target || '')}</small>
      <small>Location: ${esc(place)}${x.timezone ? ' · ' + esc(x.timezone) : ''}</small>
      <small>Session: ${esc((x.session_id || '').slice(0,8))} · Referrer: ${esc(x.referrer || 'Direct')}</small></div>
      <button type="button" class="danger visitor-delete" onclick="deleteVisit('${esc(x.id)}')">Delete</button>
    </div>`;
  }).join('') || '<p>No visitor activity yet.</p>';
}

function formatAdminDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v || '') : d.toLocaleString();
}

async function refreshDashboard() {
  const btn = $('refreshAnalytics');
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...'; }
  try {
    await render();
    await renderAnalytics();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
  }
}

window.deleteVisit = async id => {
  if (!id || !confirm('Delete this visitor activity record?')) return;
  if (!await getAdminSession()) return showError('Please sign in again.');
  const { error } = await db.from('page_visits').delete().eq('id', id);
  if (error) return showError('Could not delete visitor record: ' + error.message);
  await renderAnalytics();
};

async function render() {
  const { data: rows, error } = await db.from('shipments').select('*').order('created_at', {ascending:false});
  if (error) return showError('Could not load shipments: ' + error.message);
  const a = rows || [], q = $('adminSearch').value.toLowerCase();
  $('sTotal').firstChild.textContent = a.length;
  $('sTransit').firstChild.textContent = a.filter(x => x.status === 'In Transit').length;
  $('sOut').firstChild.textContent = a.filter(x => x.status === 'Out for Delivery').length;
  $('sDelivered').firstChild.textContent = a.filter(x => x.status === 'Delivered').length;
  $('sDelayed').firstChild.textContent = a.filter(x => x.status === 'Delayed').length;
  $('table').innerHTML = a.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x => `<div class="shipment"><div><b>${esc(x.tracking_number)}</b><small>${esc(x.current_location || '')}</small></div><div>${esc(x.status)}</div><div>${esc(x.estimated_delivery || '')}</div><div class="shipment-message">${esc(x.message || '')}</div></div><button class="danger" onclick="delShipment('${x.id}')">Delete</button></div>`).join('') || '<p>No shipments found.</p>';
}
if ($('adminSearch')) $('adminSearch').oninput = render;
if ($('refreshAnalytics')) $('refreshAnalytics').addEventListener('click', refreshDashboard);
function parseEventDate(value) { if (!value) return new Date().toISOString(); const d = new Date(value); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); }
async function saveShipment() {
  const tracking = $('fTracking').value.trim().toUpperCase();
  if (!tracking) return showError('Enter a tracking number.');
  if (!await getAdminSession()) return showError('Please sign in again.');
  const payload = {
    tracking_number: tracking, origin: $('fOrigin').value.trim(), destination: $('fDestination').value.trim(), current_location: $('fLocation').value.trim(), status: $('fStatus').value,
    estimated_delivery: $('fDelivery').value.trim() || null, recipient_name: $('fRecipient').value.trim(), service: $('fService').value.trim(), weight: $('fWeight').value.trim(),
    package_type: $('fPackageType').value.trim(), reference: $('fReference').value.trim(), message: $('fMessage').value.trim(), updated_at: new Date().toISOString()
  };
  const { data: existing, error: lookupError } = await db.from('shipments').select('id').eq('tracking_number', tracking).maybeSingle();
  if (lookupError) return showError(lookupError.message);
  let shipmentId, created = !existing;
  if (existing) {
    const { data, error } = await db.from('shipments').update(payload).eq('id', existing.id).select('id').single();
    if (error) return showError('Could not update shipment: ' + error.message); shipmentId = data.id;
  } else {
    const { data, error } = await db.from('shipments').insert(payload).select('id').single();
    if (error) return showError('Could not create shipment: ' + error.message); shipmentId = data.id;
  }
  const historyLines = $('fHistory').value.split('\n').map(x => x.trim()).filter(Boolean);
  if (historyLines.length) {
    const events = historyLines.map(line => { const parts = line.split('|').map(y => y.trim()); return {shipment_id:shipmentId,status:parts[0]||payload.status,event_time:parseEventDate(parts[1]),location:parts[2]||payload.current_location||payload.destination,description:parts.slice(3).join(' | ')||null}; });
    const { error } = await db.from('tracking_events').insert(events); if (error) return showError('Shipment saved, but tracking events could not be added: ' + error.message);
  } else {
    const { count } = await db.from('tracking_events').select('id',{count:'exact',head:true}).eq('shipment_id',shipmentId);
    if (!count) { const { error } = await db.from('tracking_events').insert([{shipment_id:shipmentId,status:payload.status,event_time:new Date().toISOString(),location:payload.current_location||payload.destination,description:payload.message||null}]); if (error) return showError('Shipment saved, but the initial tracking event could not be added: ' + error.message); }
  }
  $('fHistory').value = ''; await render(); alert(created ? 'Shipment created.' : 'Shipment updated.');
}
$('save').onclick = saveShipment;
window.delShipment = async id => { if (!confirm('Delete this shipment and its tracking events?')) return; if (!await getAdminSession()) return showError('Please sign in again.'); const { error } = await db.from('shipments').delete().eq('id',id); if (error) return showError('Could not delete shipment: '+error.message); await render(); };
db.auth.onAuthStateChange(() => openAdminDashboard());
openAdminDashboard();
