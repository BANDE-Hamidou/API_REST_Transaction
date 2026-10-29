'use strict';
/**
 * TEST DE BOUT EN BOUT de la chaîne principale :
 *
 *   CSV brut -> KNIME -> CSV valides/rejetées -> chargement PostgreSQL -> API REST
 *            -> /metrics -> Prometheus (collecte) -> Grafana (source + tableau de bord)
 *
 * Prérequis : pile Docker démarrée ET données chargées (voir docs/GUIDE_EXECUTION_EQUIPE.md).
 * Lancement (racine du projet) : npm run test:e2e
 *
 * Variables facultatives :
 *   API_URL (http://localhost:3000), PROMETHEUS_URL (http://localhost:9090),
 *   GRAFANA_URL (http://localhost:3001), GRAFANA_USER / GRAFANA_PASSWORD (admin/admin),
 *   E2E_SANS_PROMETHEUS=1, E2E_SANS_GRAFANA=1 pour ignorer ces parties.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API = process.env.API_URL || 'http://localhost:3000';
const PROM = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const GRAFANA = process.env.GRAFANA_URL || 'http://localhost:3001';
const GRAFANA_AUTH = 'Basic ' + Buffer.from(`${process.env.GRAFANA_USER || 'admin'}:${process.env.GRAFANA_PASSWORD || 'admin'}`).toString('base64');
const RACINE = path.join(__dirname, '..', '..');
const REF = `TXN-9${String(Date.now()).slice(-5)}`;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function appel(methode, chemin, corps) {
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: corps ? { 'Content-Type': 'application/json' } : {},
    body: corps ? JSON.stringify(corps) : undefined
  });
  const texte = await r.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { /* réponse non JSON (/metrics) */ }
  return { statut: r.status, json, texte, entetes: r.headers };
}
async function promql(requete) {
  const r = await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent(requete)}`);
  const j = await r.json();
  assert.equal(j.status, 'success', `requête PromQL refusée : ${requete}`);
  return j.data.result;
}
const compterLignesCsv = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length - 1;

test('1. l\'API et la base répondent', async () => {
  const r = await appel('GET', '/health/ready');
  assert.equal(r.statut, 200, `API ou base indisponible : ${r.texte}`);
  assert.equal(r.json.base, 'ok');
});

test('2. les données KNIME sont chargées et cohérentes avec le fichier produit', async () => {
  const c = await appel('GET', '/api/chargements/dernier');
  assert.equal(c.statut, 200, 'aucun chargement : exécuter le workflow KNIME puis npm run load');
  const chargement = c.json;

  const knime = await appel('GET', '/api/transactions?source=KNIME&limite=1');
  assert.equal(knime.statut, 200);
  const attenduesEnBase = chargement.lignes_valides_lues - chargement.rejets_au_chargement;
  assert.ok(knime.json.pagination.total >= attenduesEnBase - 1, // -1 : tolère une ligne modifiée par la démo
    `transactions KNIME en base : ${knime.json.pagination.total}, attendu ${attenduesEnBase}`);

  const rejets = await appel('GET', '/api/rejets/statistiques');
  assert.equal(rejets.json.total, chargement.lignes_rejetees);
  assert.ok(rejets.json.par_motif.length >= 5, 'les anomalies injectées doivent produire plusieurs motifs de rejet');

  // le fichier chargé contient bien le nombre de lignes annoncé
  const dossier = chargement.dossier_source.replace(/^\/data/, path.join(RACINE, 'data'));
  const fichier = path.join(dossier, 'transactions_valides.csv');
  if (fs.existsSync(fichier)) assert.equal(compterLignesCsv(fichier), chargement.lignes_valides_lues);

  // le dossier processed (KNIME) doit être conforme au résultat attendu
  if (chargement.dossier_source.includes('processed')) {
    const { comparer } = require('../../data/scripts/compare-outputs');
    const { ecarts } = comparer(path.join(RACINE, 'data', 'processed'), path.join(RACINE, 'data', 'expected'));
    assert.deepEqual(ecarts, [], 'la sortie KNIME diffère du résultat attendu');
  }
});

test('3. les filtres et la pagination renvoient des résultats corrects', async () => {
  const v = await appel('GET', '/api/transactions?type=VIREMENT&statut=EFFECTUEE&limite=100');
  assert.equal(v.statut, 200);
  assert.ok(v.json.donnees.length > 0);
  assert.ok(v.json.donnees.every((t) => t.type === 'VIREMENT' && t.statut === 'EFFECTUEE' && t.compte_destination));

  const m = await appel('GET', '/api/transactions?montant_min=100000&montant_max=1000000&tri=montant&ordre=asc&limite=100');
  const montants = m.json.donnees.map((t) => t.montant);
  assert.ok(montants.every((x) => x >= 100000 && x <= 1000000));
  assert.deepEqual(montants, [...montants].sort((a, b) => a - b));

  const d = await appel('GET', '/api/transactions?date_debut=2026-03-01&date_fin=2026-03-31&limite=100');
  assert.ok(d.json.donnees.every((t) => t.date_transaction.startsWith('2026-03')));

  const p1 = await appel('GET', '/api/transactions?limite=10&page=1');
  const p2 = await appel('GET', '/api/transactions?limite=10&page=2');
  const refs = new Set([...p1.json.donnees, ...p2.json.donnees].map((t) => t.reference));
  assert.equal(refs.size, 20, 'les pages 1 et 2 ne doivent pas se chevaucher');
});

test('4. cycle d\'écriture complet et erreurs attendues', async (t) => {
  const corps = {
    reference: REF, compte_source: 'CPT10000001', compte_destination: 'CPT10000002', type: 'VIREMENT',
    montant: 75000, devise: 'XOF', date_transaction: '2026-10-28T09:30:00', canal: 'MOBILE', description: 'Test E2E'
  };
  t.after(() => appel('DELETE', `/api/transactions/${REF}`)); // nettoyage même en cas d'échec

  const c = await appel('POST', '/api/transactions', corps);
  assert.equal(c.statut, 201, c.texte);
  assert.equal(c.json.source, 'API');
  assert.equal(c.json.statut, 'EN_ATTENTE');
  assert.equal((await appel('POST', '/api/transactions', corps)).statut, 409);

  const g = await appel('GET', `/api/transactions/${REF}`);
  assert.equal(g.json.montant, 75000);

  const p = await appel('PATCH', `/api/transactions/${REF}`, { statut: 'EFFECTUEE' });
  assert.equal(p.statut, 200);
  assert.equal(p.json.statut, 'EFFECTUEE');

  const invalide = await appel('POST', '/api/transactions', { ...corps, reference: 'TXN-1', montant: -3 });
  assert.equal(invalide.statut, 400);
  assert.deepEqual(invalide.json.erreur.details.map((e) => e.champ).sort(), ['montant', 'reference']);
  assert.equal((await appel('GET', '/api/transactions?type=INCONNU')).statut, 400);
  assert.equal((await appel('GET', '/api/transactions/TXN-000000')).statut, 404);

  assert.equal((await appel('DELETE', `/api/transactions/${REF}`)).statut, 204);
  assert.equal((await appel('GET', `/api/transactions/${REF}`)).statut, 404);
});

test('5. /metrics expose requêtes, erreurs et temps de réponse', async () => {
  const r = await appel('GET', '/metrics');
  assert.equal(r.statut, 200);
  for (const nom of ['http_requests_total', 'http_request_errors_total', 'http_request_duration_seconds_bucket', 'transactions_operations_total']) {
    assert.match(r.texte, new RegExp(`^${nom}\\{`, 'm'), `métrique absente : ${nom}`);
  }
  assert.match(r.texte, /http_request_errors_total\{[^}]*status_code="404"/);
  assert.match(r.texte, /transactions_operations_total\{operation="creation"[^}]*\} [1-9]/);
});

test('6. Prometheus collecte les métriques de l\'API', { skip: process.env.E2E_SANS_PROMETHEUS === '1' }, async () => {
  const cibles = await (await fetch(`${PROM}/api/v1/targets`)).json();
  const api = cibles.data.activeTargets.find((c) => c.labels.job === 'api-transactions');
  assert.ok(api, 'cible api-transactions absente de Prometheus');

  // attendre au moins une collecte postérieure aux requêtes des tests précédents (intervalle 5 s)
  let creations = 0;
  for (let i = 0; i < 12 && creations < 1; i++) {
    await pause(2500);
    const res = await promql('sum(transactions_operations_total{job="api-transactions",operation="creation"})');
    creations = res.length ? Number(res[0].value[1]) : 0;
  }
  assert.ok(creations >= 1, 'Prometheus n\'a pas encore collecté la création faite au test 4');
  assert.equal(api.health, 'up', `cible en erreur : ${api.lastError}`);
  assert.equal(Number((await promql('up{job="api-transactions"}'))[0].value[1]), 1);

  const erreurs = await promql('sum(http_request_errors_total{job="api-transactions"})');
  assert.ok(Number(erreurs[0].value[1]) >= 3, 'les erreurs 400/404/409 doivent être comptées');
  const p95 = await promql('histogram_quantile(0.95, sum by (le) (http_request_duration_seconds_bucket{job="api-transactions"}))');
  assert.ok(Number.isFinite(Number(p95[0].value[1])), 'latence p95 calculable');

  const regles = await (await fetch(`${PROM}/api/v1/rules`)).json();
  assert.ok(regles.data.groups.some((g) => g.name === 'api-transactions'), 'règles d\'alerte non chargées');
});

test('7. Grafana est provisionné (source Prometheus + tableau de bord)', { skip: process.env.E2E_SANS_GRAFANA === '1' }, async () => {
  const sante = await fetch(`${GRAFANA}/api/health`);
  assert.equal(sante.status, 200);
  const ds = await fetch(`${GRAFANA}/api/datasources/uid/prometheus`, { headers: { Authorization: GRAFANA_AUTH } });
  assert.equal(ds.status, 200, 'source de données Prometheus absente (ou identifiants Grafana incorrects)');
  const tb = await fetch(`${GRAFANA}/api/dashboards/uid/g5-api-transactions`, { headers: { Authorization: GRAFANA_AUTH } });
  assert.equal(tb.status, 200, 'tableau de bord non provisionné');
  const { dashboard } = await tb.json();
  assert.ok(dashboard.panels.length >= 10);
  // Grafana interroge réellement Prometheus via sa source de données
  const q = await fetch(`${GRAFANA}/api/datasources/proxy/uid/prometheus/api/v1/query?query=up`, { headers: { Authorization: GRAFANA_AUTH } });
  assert.equal(q.status, 200, 'Grafana n\'arrive pas à interroger Prometheus');
});
