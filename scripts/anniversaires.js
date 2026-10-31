// Envoie chaque matin une notification pour les anniversaires (jour J et veille).
// Lancé par .github/workflows/anniversaires.yml. La clé d'envoi est dans FB/familles/FAM-pushkey (créée par l'appli).
const webpush = require('web-push');
const FB = 'https://celine-fcdb2-default-rtdb.europe-west1.firebasedatabase.app';
const FAM = 'mk4tq-zr8wd-h3pxn-97cfa';

// Date du jour en Belgique (le serveur GitHub est à l'heure UTC).
function partsBE(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}

function messages(events, now) {
  const today = partsBE(now), tomorrow = partsBE(new Date(now.getTime() + 864e5));
  const out = [];
  for (const e of Object.values(events || {})) {
    if (!e || !e.date || !(e.type === 'anniv' || (e.yearly && /anniv/i.test(e.t || '')))) continue;
    const [y, m, d] = e.date.split('-').map(Number);
    const age = yy => (y > 1900 && y < yy ? ' (' + (yy - y) + (yy - y > 1 ? ' ans' : ' an') + ')' : '');
    if (m === today.m && d === today.d) out.push({ title: '🎂 Anniversaire aujourd’hui !', body: e.t + age(today.y) + ' — pense à lui souhaiter 💗', tag: 'anniv-' + e.id });
    else if (m === tomorrow.m && d === tomorrow.d) out.push({ title: '🎁 Anniversaire demain', body: e.t + age(tomorrow.y) + ' — pense au cadeau !', tag: 'anniv-veille-' + e.id });
  }
  return out;
}

async function main() {
  const data = await (await fetch(FB + '/familles/' + FAM + '.json')).json() || {};
  const msgs = messages(data.events, new Date());
  console.log(msgs.length + ' message(s)', msgs.map(m => m.body));
  if (!msgs.length) return;
  const key = await (await fetch(FB + '/familles/' + FAM + '-pushkey.json')).json();
  if (!key || !key.pub || !key.priv) { console.log('Personne n’a encore activé les notifications.'); return; }
  webpush.setVapidDetails('https://nicolas06061997.github.io/Celine/', key.pub, key.priv);
  const subs = await (await fetch(FB + '/familles/' + FAM + '-push.json')).json() || {};
  for (const [id, s] of Object.entries(subs)) {
    for (const m of msgs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(m), { TTL: 6 * 3600 }); console.log('envoyé à', s.name || id); }
      catch (e) {
        console.log('échec', s.name || id, e.statusCode);
        // Téléphone désabonné ou appli supprimée : on oublie cet abonnement.
        if (e.statusCode === 404 || e.statusCode === 410) { await fetch(FB + '/familles/' + FAM + '-push/' + id + '.json', { method: 'DELETE' }); break; }
      }
    }
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { messages };
