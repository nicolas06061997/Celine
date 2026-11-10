// Rappels envoyés sur les téléphones (Web Push), lancé tous les quarts d'heure par .github/workflows/rappels.yml.
//  - Anniversaires : la veille (dès 7h) et le jour même (dès 7h).
//  - Rendez-vous et autres événements : la veille dès 19h, et entre 1 h 30 et quelques minutes avant s'il y a une heure
//    (GitHub lance la tâche toutes les 30 à 45 min en pratique, d'où cette fenêtre large).
// Chaque rappel n'est envoyé qu'une fois : les rappels déjà envoyés sont notés dans FB/familles/FAM-sent.
// La clé d'envoi est dans FB/familles/FAM-pushkey (créée par l'appli).
const FB = 'https://celine-fcdb2-default-rtdb.europe-west1.firebasedatabase.app';
const FAM = 'mk4tq-zr8wd-h3pxn-97cfa';
const url = p => FB + '/familles/' + FAM + p + '.json';

// Heure « murale » en Belgique, en minutes (le serveur GitHub est à l'heure UTC).
function wallBE(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, t: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 6e4 };
}
const dayKey = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const hFmt = t => { const [h, m] = t.split(':'); return (+h) + 'h' + (m !== '00' ? m : ''); };
// « Dans 1 h 20 », « Dans 1 heure », « Dans 35 minutes » (arrondi à 5 min)
const inMin = l => { const r = Math.max(5, Math.round(l / 5) * 5); return r < 60 ? 'Dans ' + r + ' minutes' : r === 60 ? 'Dans 1 heure' : 'Dans ' + Math.floor(r / 60) + ' h ' + String(r % 60).padStart(2, '0'); };
const ICON = { rdv: '📅', ecole: '🎒', sante: '🩺', autre: '⭐' };

// Liste des rappels à envoyer maintenant : [{key, title, body, tag}]
function reminders(events, now) {
  const n = wallBE(now), today = dayKey(n.y, n.m, n.d);
  const tm = wallBE(new Date(now.getTime() + 864e5)), tomorrow = dayKey(tm.y, tm.m, tm.d);
  const out = [];
  for (const e of Object.values(events || {})) {
    if (!e || !e.date || e.rem === false) continue;
    const [y, m, d] = e.date.split('-').map(Number);
    // Date de l'événement cette année (s'il revient chaque année) ou sa vraie date.
    const occ = yy => e.yearly ? dayKey(yy, m, Math.min(d, new Date(Date.UTC(yy, m, 0)).getUTCDate())) : e.date;   // 29 février → 28 les autres années
    const isToday = occ(n.y) === today, isTomorrow = occ(tm.y) === tomorrow;
    const anniv = e.type === 'anniv' || (e.yearly && /anniv/i.test(e.t || ''));
    if (anniv) {
      const age = yy => (y > 1900 && y < yy ? ' (' + (yy - y) + (yy - y > 1 ? ' ans' : ' an') + ')' : '');
      if (n.h >= 7 && isToday) out.push({ key: 'aj-' + e.id + '-' + today, title: '🎂 Anniversaire aujourd’hui !', body: e.t + age(n.y) + ' — pense à lui souhaiter 💗', tag: 'anniv-' + e.id });
      if (n.h >= 7 && isTomorrow) out.push({ key: 'av-' + e.id + '-' + tomorrow, title: '🎁 Anniversaire demain', body: e.t + age(tm.y) + ' — pense au cadeau !', tag: 'anniv-veille-' + e.id });
      continue;
    }
    const ic = ICON[e.type] || '📅', at = e.time ? ' à ' + hFmt(e.time) : '';
    if (n.h >= 19 && isTomorrow) out.push({ key: 'rv-' + e.id + '-' + tomorrow, title: '🔔 Demain, ne pas oublier', body: ic + ' ' + e.t + at, tag: 'veille-' + e.id });
    if (e.time && isToday) {
      const [hh, mm] = e.time.split(':').map(Number), left = Date.UTC(n.y, n.m - 1, n.d, hh, mm) / 6e4 - n.t;
      if (left > 0 && left <= 95) out.push({ key: 'rh-' + e.id + '-' + today + '-' + e.time, title: '⏰ ' + inMin(left), body: ic + ' ' + e.t + at, tag: 'heure-' + e.id });
    }
  }
  return out;
}

async function main() {
  const get = async p => (await (await fetch(url(p))).json()) || {};
  const data = await get(''), sent = await get('-sent');
  const todo = reminders(data.events, new Date()).filter(r => !sent[r.key]);
  console.log(todo.length + ' rappel(s) à envoyer', todo.map(r => r.title + ' / ' + r.body));
  if (!todo.length) return;
  const key = await get('-pushkey');
  if (!key.pub || !key.priv) { console.log('Personne n’a encore activé les notifications.'); return; }
  const webpush = require('web-push');
  webpush.setVapidDetails('https://nicolas06061997.github.io/Celine/', key.pub, key.priv);
  const subs = await get('-push');
  for (const r of todo) {
    for (const [id, s] of Object.entries(subs)) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(r), { TTL: 3 * 3600 }); console.log('envoyé à', s.name || id); }
      catch (e) {
        console.log('échec', s.name || id, e.statusCode);
        // Téléphone désabonné ou appli supprimée : on oublie cet abonnement.
        if (e.statusCode === 404 || e.statusCode === 410) { await fetch(FB + '/familles/' + FAM + '-push/' + id + '.json', { method: 'DELETE' }); delete subs[id]; }
      }
    }
    sent[r.key] = Date.now();
  }
  // On garde la trace des rappels envoyés pendant 3 jours.
  for (const k in sent) if (sent[k] < Date.now() - 3 * 864e5) delete sent[k];
  await fetch(url('-sent'), { method: 'PUT', body: JSON.stringify(sent) });
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { reminders };
