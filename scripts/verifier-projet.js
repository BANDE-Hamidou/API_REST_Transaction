#!/usr/bin/env node
'use strict';
/**
 * Vérification statique de la COHÉRENCE du projet (aucun service requis) :
 *   - présence des fichiers livrables ;
 *   - mêmes valeurs autorisées dans : règles KNIME (data), API, schéma SQL, OpenAPI ;
 *   - métriques utilisées par Grafana/Prometheus réellement exposées par l'API ;
 *   - nom du job Prometheus identique dans prometheus.yml, Grafana et les alertes ;
 *   - données d'exemple à jour (régénération déterministe identique au fichier versionné).
 * Usage : npm run check   (code de sortie 1 si un contrôle échoue)
 */
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let echecs = 0;
const ok = (m) => console.log(`  OK     ${m}`);
const ko = (m) => { echecs++; console.log(`  ECHEC  ${m}`); };
const verifier = (cond, m) => (cond ? ok(m) : ko(m));
const memes = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

console.log('\n1. Fichiers livrables');
[
  'README.md', 'docker-compose.yml', '.env.example', '.gitignore',
  'db/init/01_schema.sql',
  'data/raw/transactions_brutes.csv', 'data/raw/anomalies_injectees.json',
  'data/expected/transactions_valides.csv', 'data/expected/transactions_rejetees.csv', 'data/expected/resume.json',
  'api/package.json', 'api/package-lock.json', 'api/Dockerfile', 'api/openapi.yaml', 'api/src/server.js',
  'monitoring/prometheus/prometheus.yml', 'monitoring/prometheus/alert_rules.yml',
  'monitoring/grafana/provisioning/datasources/prometheus.yml',
  'monitoring/grafana/provisioning/dashboards/dashboards.yml',
  'monitoring/grafana/dashboards/api-transactions.json',
  'tests/e2e/chaine-complete.test.js', 'tests/postman/API_Transactions_G5.postman_collection.json',
  'docs/EXIGENCES.md', 'docs/ARCHITECTURE.md', 'docs/CONTRATS.md', 'docs/INSTALLATION_WINDOWS.md',
  'docs/KNIME_WORKFLOW.md', 'docs/PLAN_EQUIPE.md', 'docs/GUIDE_EXECUTION_EQUIPE.md',
  'docs/SCENARIO_DEMO.md', 'docs/RAPPORT_TESTS.md', 'knime/README.md'
].forEach((f) => verifier(fs.existsSync(path.join(R, f)), f));
const knwf = fs.existsSync(path.join(R, 'knime')) && fs.readdirSync(path.join(R, 'knime')).some((f) => f.endsWith('.knwf'));
if (knwf) ok('knime/*.knwf (workflow KNIME exporté)');
else console.log('  A FAIRE knime/transactions_etl.knwf absent : à exporter depuis KNIME (docs/KNIME_WORKFLOW.md, étape 9)');
const pptx = fs.existsSync(path.join(R, 'presentation')) && fs.readdirSync(path.join(R, 'presentation')).some((f) => f.endsWith('.pptx'));
verifier(pptx, 'presentation/*.pptx');

console.log('\n2. Valeurs autorisées identiques (KNIME / API / SQL / OpenAPI)');
const regleData = require(path.join(R, 'data/scripts/rules.js'));
const regleApi = require(path.join(R, 'api/src/domain/rules.js'));
const sql = lire('db/init/01_schema.sql');
const openapi = lire('api/openapi.yaml');
const listeSql = (col) => {
  const m = sql.match(new RegExp(`CHECK \\(${col} IN \\(([^)]+)\\)\\)`));
  return m ? m[1].split(',').map((s) => s.trim().replace(/'/g, '')) : [];
};
for (const [nom, col] of [['TYPES', 'type'], ['DEVISES', 'devise'], ['STATUTS', 'statut'], ['CANAUX', 'canal']]) {
  verifier(memes(regleData[nom], regleApi[nom]), `${nom} : data/scripts/rules.js = api/src/domain/rules.js`);
  verifier(memes(regleApi[nom], listeSql(col)), `${nom} : API = CHECK SQL (${col})`);
  verifier(regleApi[nom].every((v) => openapi.includes(v)), `${nom} : présents dans openapi.yaml`);
}
verifier(memes(regleApi.CATEGORIES, listeSql('categorie_montant')), 'CATEGORIES : API = CHECK SQL');
verifier(String(regleData.RE_REFERENCE) === String(regleApi.RE_REFERENCE), 'format de référence identique (data / API)');
verifier(String(regleData.RE_COMPTE) === String(regleApi.RE_COMPTE), 'format de compte identique (data / API)');
verifier(sql.includes("'^TXN-[0-9]{6}$'") && sql.includes("'^CPT[0-9]{8}$'"), 'formats référence / compte présents dans le SQL');
verifier(regleData.SEUIL_FAIBLE === regleApi.SEUIL_FAIBLE && regleData.SEUIL_ELEVE === regleApi.SEUIL_ELEVE, 'seuils de catégorie identiques');
const entete = lire('data/expected/transactions_valides.csv').split(/\r?\n/)[0].split(',');
verifier(memes(entete, regleData.COLONNES_VALIDES), 'colonnes du CSV valides = contrat');

console.log('\n3. Métriques : API -> Prometheus -> Grafana');
const metricsJs = lire('api/src/metrics/metrics.js');
const declarees = new Set([...metricsJs.matchAll(/name: '([a-z_]+)'/g)].map((m) => m[1]));
const dashboard = JSON.parse(lire('monitoring/grafana/dashboards/api-transactions.json'));
const exprs = dashboard.panels.flatMap((p) => p.targets.map((t) => t.expr));
const defauts = /^(up|process_|nodejs_)/;
const utilisees = new Set(exprs.flatMap((e) => [...e.matchAll(/\b([a-z_][a-z0-9_]*)(?=\{)/g)].map((m) => m[1])));
for (const m of utilisees) {
  const base = m.replace(/_(bucket|sum|count)$/, '');
  verifier(declarees.has(base) || defauts.test(m), `Grafana utilise ${m} : ${declarees.has(base) ? 'exposée par l\'API' : 'métrique standard'}`);
}
for (const m of ['http_requests_total', 'http_request_errors_total', 'http_request_duration_seconds']) {
  verifier(declarees.has(m), `exigence : métrique ${m} déclarée`);
}
const job = (lire('monitoring/prometheus/prometheus.yml').match(/job_name: (api-[a-z-]+)/) || [])[1];
verifier(job === 'api-transactions', `job Prometheus = ${job}`);
verifier(exprs.every((e) => !e.includes('job=') || e.includes(`job=\"${job}\"`) || e.includes(`job="${job}"`)), 'Grafana filtre sur le même job');
verifier(lire('monitoring/prometheus/alert_rules.yml').includes(`job="${job}"`), 'les alertes ciblent le même job');
const ds = lire('monitoring/grafana/provisioning/datasources/prometheus.yml');
verifier(/uid: prometheus/.test(ds) && dashboard.panels.every((p) => p.datasource.uid === 'prometheus'), 'uid de la source Grafana identique dans le tableau de bord');
const compose = lire('docker-compose.yml');
verifier(compose.includes("targets: ['api:3000']") || lire('monitoring/prometheus/prometheus.yml').includes("'api:3000'"), 'Prometheus cible le service Docker api:3000');
verifier(/^\s{2}api:/m.test(compose) && /^\s{2}prometheus:/m.test(compose) && /^\s{2}grafana:/m.test(compose) && /^\s{2}postgres:/m.test(compose), 'les 4 services sont déclarés dans docker-compose.yml');

console.log('\n4. Données d\'exemple à jour');
const { generer } = require(path.join(R, 'data/scripts/generate-transactions.js'));
const { traiterLot } = regleData;
const { lireCsv } = require(path.join(R, 'data/scripts/csv.js'));
const { lignes } = generer({ nombre: 1000, graine: 2026 });
const brutes = lireCsv(path.join(R, 'data/raw/transactions_brutes.csv'));
verifier(brutes.length === lignes.length && brutes.every((b, i) => b.reference === lignes[i].reference && b.montant === lignes[i].montant),
  `transactions_brutes.csv = génération graine 2026 (${brutes.length} lignes)`);
const { valides, rejetees } = traiterLot(brutes);
const resume = JSON.parse(lire('data/expected/resume.json'));
verifier(resume.lignes_valides === valides.length && resume.lignes_rejetees === rejetees.length,
  `data/expected à jour (${valides.length} valides, ${rejetees.length} rejetées)`);

console.log(echecs ? `\n${echecs} contrôle(s) en échec.` : '\nTous les contrôles de cohérence sont réussis.');
process.exit(echecs ? 1 : 0);
