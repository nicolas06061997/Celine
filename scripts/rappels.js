// Rappels envoyés sur les téléphones (Web Push), lancé tous les quarts d'heure par .github/workflows/rappels.yml.
//  - Anniversaires : la veille (dès 7h) et le jour même (dès 7h).
//  - Rendez-vous et autres événements : la veille dès 19h, et entre 1 h 30 et quelques minutes avant s'il y a une heure
//    (GitHub lance la tâche toutes les 30 à 45 min en pratique, d'où cette fenêtre large).
//  - Poubelles : la veille dès 19h (une seule notification pour toutes les collectes du lendemain).
//  - Ménage « je m'en occupe » : aux autres téléphones (une notification par personne, avec toutes ses tâches prises).
//  - Coup de pouce et petit mot : dès qu'ils sont envoyés (au prochain passage), seulement aux autres téléphones.
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
    const occ = yy => e.yearly ? dayKey(yy, m, d) : e.date;
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
      if (left > 0 && left <= 95) out.push({ key: 'rh-' + e.id + '-' + today + '-' + e.time, title: '⏰ ' + (left > 75 ? 'Dans 1 h 30' : left > 50 ? 'Dans 1 heure' : 'Dans ' + Math.max(5, Math.round(left / 5) * 5) + ' minutes'), body: ic + ' ' + e.t + at, tag: 'heure-' + e.id });
    }
  }
  return out;
}

// Poubelles : prochaine collecte (date de référence + toutes les w semaines), en jours « muraux ».
const dayNum = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
function binReminders(bins, now) {
  const n = wallBE(now), tm = wallBE(new Date(now.getTime() + 864e5)), tomorrow = dayKey(tm.y, tm.m, tm.d), t = dayNum(tomorrow);
  if (n.h < 19) return [];
  const due = Object.values(bins || {}).filter(b => {
    if (!b || !b.date || b.rem === false) return false;
    const s = (b.w || 1) * 7, diff = t - dayNum(b.date);
    return diff >= 0 && diff % s === 0;
  });
  if (!due.length) return [];
  return [{ key: 'pb-' + tomorrow, title: '🗑️ Ce soir, sortir les poubelles', body: due.map(b => (b.e || '') + ' ' + b.n).join(' · '), tag: 'poubelles', url: './' }];
}

// Coups de pouce (du jour) et petits mots : envoyés une fois, aux bons téléphones seulement.
function msgReminders(msgs, profiles, now) {
  const n = wallBE(now), today = dayKey(n.y, n.m, n.d), name = id => ((profiles || {})[id] || {}).name || '';
  const out = [];
  for (const m of Object.values(msgs || {})) {
    if (!m || m.seen || !m.u || now.getTime() - m.u > 6 * 3600e3) continue;
    const from = name(m.from);
    // Abonnement de l'expéditeur (ou du destinataire) : par profil (me), sinon par prénom.
    const is = (s, id, nm) => s.me ? s.me === id : !!nm && (s.name || '') === nm;
    if (m.k === 'pouce' && m.d === today)
      out.push({ key: 'msg-' + m.id + '-' + m.u, title: '🤝 ' + (from || 'Coup de pouce'), body: (m.e || '') + ' ' + m.t, tag: 'pouce-' + m.from, url: './', to: s => !is(s, m.from, from) });
    if (m.k === 'mot')
      out.push({ key: 'msg-' + m.id + '-' + m.u, title: '💌 Un petit mot' + (from ? ' de ' + from : ''), body: 'Ouvre Céline pour le lire 💗', tag: 'mot-' + m.from, url: './', to: s => is(s, m.to, name(m.to)) });
  }
  return out;
}

// Ménage : tâches prises (« je m'en occupe ») ces 6 dernières heures et pas encore annoncées.
function claimReminders(tasks, profiles, now, sent) {
  const n = wallBE(now), dn = dayNum(dayKey(n.y, n.m, n.d)), dow = (new Date(dn * 864e5).getUTCDay() + 6) % 7;
  const mon = new Date((dn - dow) * 864e5), wk = dayKey(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
  const by = {};
  for (const t of Object.values(tasks || {})) {
    if (!t || t.whoW !== wk || !t.who || t.who === '-' || !t.wu || now.getTime() - t.wu > 6 * 3600e3 || t.done === wk) continue;
    const k = 'cl-' + t.id + '-' + t.wu;
    if (!sent[k]) (by[t.who] = by[t.who] || []).push({ t, k });
  }
  return Object.entries(by).map(([who, l]) => {
    const name = ((profiles || {})[who] || {}).name || '';
    const is = s => s.me ? s.me === who : !!name && (s.name || '') === name;
    return { key: l.map(x => x.k).join('|'), mark: l.map(x => x.k), title: '🙋 ' + (name || 'Quelqu’un') + ' s’en occupe', body: l.map(x => (x.t.e || '🧹') + ' ' + x.t.t).join(' · '), tag: 'menage-' + who, url: './', to: s => !is(s) };
  });
}

async function main() {
  const get = async p => (await (await fetch(url(p))).json()) || {};
  const data = await get(''), sent = await get('-sent');
  const now = new Date();
  const todo = [...reminders(data.events, now), ...binReminders(data.bins, now), ...msgReminders(data.msgs, data.profiles, now), ...claimReminders(data.tasks, data.profiles, now, sent)].filter(r => !sent[r.key]);
  console.log(todo.length + ' rappel(s) à envoyer', todo.map(r => r.title + ' / ' + r.body));
  if (!todo.length) return;
  const key = await get('-pushkey');
  if (!key.pub || !key.priv) { console.log('Personne n’a encore activé les notifications.'); return; }
  const webpush = require('web-push');
  webpush.setVapidDetails('https://nicolas06061997.github.io/Celine/', key.pub, key.priv);
  const subs = await get('-push');
  for (const r of todo) {
    const { to, key: _k, mark, ...msg } = r;
    for (const [id, s] of Object.entries(subs)) {
      if (to && !to(s)) continue;
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 3 * 3600 }); console.log('envoyé à', s.name || id); }
      catch (e) {
        console.log('échec', s.name || id, e.statusCode);
        // Téléphone désabonné ou appli supprimée : on oublie cet abonnement.
        if (e.statusCode === 404 || e.statusCode === 410) { await fetch(FB + '/familles/' + FAM + '-push/' + id + '.json', { method: 'DELETE' }); delete subs[id]; }
      }
    }
    if (mark) for (const k of mark) sent[k] = Date.now(); else sent[r.key] = Date.now();
  }
  // On garde la trace des rappels envoyés pendant 3 jours.
  for (const k in sent) if (sent[k] < Date.now() - 3 * 864e5) delete sent[k];
  await fetch(url('-sent'), { method: 'PUT', body: JSON.stringify(sent) });
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { reminders, binReminders, msgReminders, claimReminders };
