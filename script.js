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


