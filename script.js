/* ParcelQuery production Supabase client
   Public browser key is safe to use here because database access is protected by Supabase RLS.
*/
const SUPABASE_URL = 'https://mticzeipgnyhefwspiuq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Rjr6Y-LYLs5VHJtMoU_efw_o-bbRb_7';
const ADMIN_UID = '5f6c3796-9812-4363-b4c9-6bee2325b0fb';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pct = s => ({'Shipment Created':10,'Picked Up':28,'In Transit':55,'Out for Delivery':82,'Delivered':100,'Delayed':45}[s] || 40);

function showError(message) { alert(message); }

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString([], {dateStyle:'medium', timeStyle:'short'});
}

function shipmentFromDb(row, events) {
  return {
    tracking: row.tracking_number,
    status: row.status,
    location: row.current_location || '',
    origin: row.origin,
    destination: row.destination,
    shipmentDate: formatDate(row.created_at),
    delivery: row.estimated_delivery || '',
    service: row.service || 'Standard',
    weight: row.weight || '',
    packageType: row.package_type || '',
    reference: row.reference || '',
    recipientName: row.recipient_name || '',
    message: row.message || '',
    history: (events || []).map(e => [e.status, formatDate(e.event_time), e.location, e.description || ''])
  };
}

async function track(id) {
  if (!id) return;
  const { data: row, error } = await db.from('shipments').select('*').eq('tracking_number', id).maybeSingle();
  if (error) { console.error(error); showError('Unable to look up the shipment right now. Please try again.'); return; }
  if (!row) { showError('Tracking number not found. Please check the number and try again.'); return; }

  const { data: events, error: eventError } = await db.from('tracking_events').select('*').eq('shipment_id', row.id).order('event_time', {ascending:true});
  if (eventError) { console.error(eventError); showError('Shipment found, but its tracking history could not be loaded.'); return; }

  const d = shipmentFromDb(row, events);
  $('results').classList.remove('hidden');
  $('statusPill').textContent = d.status;
  $('resultTitle').textContent = 'Shipment ' + d.tracking;
  $('resultMessage').textContent = d.message || '';
  ['Tracking','Location','Delivery','Service'].forEach(k => $(('r'+k)).textContent = d[{Tracking:'tracking',Location:'location',Delivery:'delivery',Service:'service'}[k]] || '-');
  ['Origin','Destination','ShipmentDate','Weight','PackageType','Reference'].forEach(k => $(('r'+k)).textContent = d[k.charAt(0).toLowerCase()+k.slice(1)] || '-');
  const p = pct(d.status);
  $('progressBar').style.width = p + '%';
  $('progressText').textContent = p + '%';
  $('history').innerHTML = (d.history || []).slice().reverse().map(e => `<div class="event"><b>${esc(e[0])}</b><small>${esc(e[1])} · ${esc(e[2])}${e[3] ? ' · '+esc(e[3]) : ''}</small></div>`).join('') || '<p>No tracking events recorded yet.</p>';
  $('results').scrollIntoView({behavior:'smooth'});
}

$('trackBtn').onclick = () => track($('trackingInput').value.trim().toUpperCase());
$('trackingInput').onkeydown = e => { if (e.key === 'Enter') $('trackBtn').click(); };
document.querySelectorAll('[data-demo]').forEach(x => x.onclick = () => { $('trackingInput').value = x.dataset.demo; track(x.dataset.demo); });
$('copyTracking').onclick = () => navigator.clipboard?.writeText($('rTracking').textContent);
$('printBtn').onclick = () => print();

const modal = $('adminModal');
$('openAdmin').onclick = () => modal.classList.remove('hidden');
$('closeAdmin').onclick = () => modal.classList.add('hidden');

async function getAdminSession() {
  const { data: { session } } = await db.auth.getSession();
  return session && session.user && session.user.id === ADMIN_UID ? session : null;
}

async function openAdminDashboard() {
  const session = await getAdminSession();
  if (!session) {
    $('login').classList.remove('hidden');
    $('admin').classList.add('hidden');
    return;
  }
  $('login').classList.add('hidden');
  $('admin').classList.remove('hidden');
  await render();
}

$('loginBtn').onclick = async () => {
  const email = $('user').value.trim();
  const password = $('pass').value;
  if (!email || !password) return showError('Enter your admin email and password.');
  const { data, error } = await db.auth.signInWithPassword({email, password});
  if (error) { console.error(error); return showError(error.message || 'Sign in failed.'); }
  if (!data.user || data.user.id !== ADMIN_UID) {
    await db.auth.signOut();
    return showError('This account is not authorized for the ParcelQuery admin area.');
  }
  $('pass').value = '';
  await openAdminDashboard();
};

$('logout').onclick = async () => { await db.auth.signOut(); await openAdminDashboard(); };

async function render() {
  const { data: rows, error } = await db.from('shipments').select('*').order('created_at', {ascending:false});
  if (error) { console.error(error); return showError('Could not load shipments.'); }
  const a = rows || [];
  const q = $('adminSearch').value.toLowerCase();
  $('sTotal').firstChild.textContent = a.length;
  $('sTransit').firstChild.textContent = a.filter(x => x.status === 'In Transit').length;
  $('sOut').firstChild.textContent = a.filter(x => x.status === 'Out for Delivery').length;
  $('sDelivered').firstChild.textContent = a.filter(x => x.status === 'Delivered').length;
  $('sDelayed').firstChild.textContent = a.filter(x => x.status === 'Delayed').length;
  $('table').innerHTML = a.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x => `<div class="shipment"><div><b>${esc(x.tracking_number)}</b><small>${esc(x.current_location || '')}</small></div><div>${esc(x.status)}</div><div>${esc(x.estimated_delivery || '')}</div><button class="danger" onclick="delShipment('${x.id}')">Delete</button></div>`).join('') || '<p>No shipments found.</p>';
}

$('adminSearch').oninput = render;

async function saveShipment() {
  const tracking = $('fTracking').value.trim().toUpperCase();
  if (!tracking) return showError('Enter a tracking number.');
  const session = await getAdminSession();
  if (!session) return showError('Please sign in again.');

  const payload = {
    tracking_number: tracking,
    origin: $('fOrigin').value.trim(),
    destination: $('fDestination').value.trim(),
    current_location: $('fLocation').value.trim(),
    status: $('fStatus').value,
    estimated_delivery: $('fDelivery').value.trim() || null,
    recipient_name: $('fRecipient').value.trim(),
    service: $('fService').value.trim(),
    weight: $('fWeight').value.trim(),
    package_type: $('fPackageType').value.trim(),
    reference: $('fReference').value.trim(),
    message: $('fMessage').value.trim(),
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: lookupError } = await db.from('shipments').select('id').eq('tracking_number', tracking).maybeSingle();
  if (lookupError) return showError(lookupError.message);

  let shipmentId;
  if (existing) {
    const { data, error } = await db.from('shipments').update(payload).eq('id', existing.id).select('id').single();
    if (error) return showError('Could not update shipment: ' + error.message);
    shipmentId = data.id;
  } else {
    const { data, error } = await db.from('shipments').insert(payload).select('id').single();
    if (error) return showError('Could not create shipment: ' + error.message);
    shipmentId = data.id;
  }

  const historyLines = $('fHistory').value.split('\n').map(x => x.trim()).filter(Boolean);
  if (historyLines.length) {
    const events = historyLines.map(line => {
      const parts = line.split('|').map(y => y.trim());
      return {shipment_id: shipmentId, status: parts[0] || payload.status, event_time: parseEventDate(parts[1]), location: parts[2] || payload.current_location || payload.destination, description: parts.slice(3).join(' | ') || null};
    });
    const { error } = await db.from('tracking_events').insert(events);
    if (error) return showError('Shipment saved, but tracking events could not be added: ' + error.message);
  } else {
    const { count } = await db.from('tracking_events').select('id', {count:'exact', head:true}).eq('shipment_id', shipmentId);
    if (!count) {
      const { error } = await db.from('tracking_events').insert([{shipment_id:shipmentId,status:payload.status,event_time:new Date().toISOString(),location:payload.current_location || payload.destination,description:payload.message || null}]);
      if (error) return showError('Shipment saved, but the initial tracking event could not be added: ' + error.message);
    }
  }

  $('fHistory').value = '';
  await render();
  alert(existing ? 'Shipment updated.' : 'Shipment created.');
}

function parseEventDate(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

$('save').onclick = saveShipment;

window.delShipment = async id => {
  if (!confirm('Delete this shipment and its tracking events?')) return;
  const session = await getAdminSession();
  if (!session) return showError('Please sign in again.');
  const { error } = await db.from('shipments').delete().eq('id', id);
  if (error) return showError('Could not delete shipment: ' + error.message);
  await render();
};

// Restore an existing session when the page opens.
db.auth.onAuthStateChange(() => openAdminDashboard());
