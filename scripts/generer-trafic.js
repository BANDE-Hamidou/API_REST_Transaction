#!/usr/bin/env node
'use strict';
/**
 * Génère du trafic sur l'API pendant la démonstration pour animer les graphiques
 * Grafana : consultations, filtres, quelques créations/suppressions et des erreurs
 * volontaires (400, 404, 409).
 *
 * Usage : node scripts/generer-trafic.js [--duree 60] [--rps 5] [--api http://localhost:3000]
 */
const args = { duree: 60, rps: 5, api: process.env.API_URL || 'http://localhost:3000' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const cle = argv[i].replace(/^--/, '');
  if (!(cle in args)) { console.error(`Argument inconnu : ${argv[i]}`); process.exit(1); }
  args[cle] = cle === 'api' ? argv[i + 1] : Number(argv[i + 1]);
}

const TYPES = ['DEPOT', 'RETRAIT', 'VIREMENT', 'PAIEMENT'];
const hasard = (l) => l[Math.floor(Math.random() * l.length)];
const ref = () => `TXN-8${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

const SCENARIOS = [
  [30, () => ['GET', `/api/transactions?type=${hasard(TYPES)}&page=${1 + Math.floor(Math.random() * 5)}`]],
  [15, () => ['GET', `/api/transactions?montant_min=100000&tri=montant&ordre=desc`]],
  [10, () => ['GET', `/api/transactions?date_debut=2026-0${1 + Math.floor(Math.random() * 9)}-01&date_fin=2026-09-30`]],
  [10, () => ['GET', `/api/transactions/TXN-${String(1 + Math.floor(Math.random() * 1000)).padStart(6, '0')}`]],
  [8, () => ['GET', '/api/transactions/statistiques']],
  [5, () => ['GET', '/api/rejets?limite=10']],
  [6, () => ['POST', '/api/transactions', {
    reference: ref(), compte_source: 'CPT10000001', type: 'DEPOT', montant: 1000 + Math.floor(Math.random() * 500000),
    date_transaction: '2026-10-28T10:00:00', canal: 'GUICHET', description: 'Trafic de demonstration'
  }]],
  [6, () => ['GET', '/api/transactions?type=INCONNU']], // 400
  [5, () => ['GET', '/api/transactions/TXN-000000']], // 404
  [5, () => ['POST', '/api/transactions', { reference: 'TXN-000001', compte_source: 'CPT10000001', type: 'DEPOT', montant: 10, date_transaction: '2026-10-28T10:00:00', canal: 'GAB' }]] // 409
];
const poidsTotal = SCENARIOS.reduce((s, [p]) => s + p, 0);
function tirerScenario() {
  let r = Math.random() * poidsTotal;
  for (const [p, f] of SCENARIOS) { if ((r -= p) < 0) return f(); }
  return SCENARIOS[0][1]();
}

const compteurs = {};
const crees = [];
async function envoyer() {
  const [methode, chemin, corps] = tirerScenario();
  try {
    const r = await fetch(`${args.api}${chemin}`, {
      method: methode,
      headers: corps ? { 'Content-Type': 'application/json' } : {},
      body: corps ? JSON.stringify(corps) : undefined
    });
    compteurs[r.status] = (compteurs[r.status] || 0) + 1;
    if (methode === 'POST' && r.status === 201) crees.push(corps.reference);
  } catch {
    compteurs.injoignable = (compteurs.injoignable || 0) + 1;
  }
}

(async () => {
  console.log(`[trafic] ${args.rps} requêtes/s pendant ${args.duree} s vers ${args.api} (Ctrl+C pour arrêter)`);
  const fin = Date.now() + args.duree * 1000;
  const minuterie = setInterval(() => {
    if (Date.now() > fin) return;
    for (let i = 0; i < args.rps; i++) envoyer();
  }, 1000);
  const affichage = setInterval(() => console.log('[trafic] réponses :', JSON.stringify(compteurs)), 5000);
  await new Promise((r) => setTimeout(r, args.duree * 1000 + 500));
  clearInterval(minuterie); clearInterval(affichage);
  // nettoyage : on supprime les transactions de démonstration créées
  await Promise.all(crees.map((r) => fetch(`${args.api}/api/transactions/${r}`, { method: 'DELETE' }).catch(() => {})));
  console.log(`[trafic] terminé. Réponses : ${JSON.stringify(compteurs)} ; ${crees.length} transaction(s) de test supprimée(s)`);
})();
