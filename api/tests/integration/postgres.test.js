'use strict';
/**
 * Tests d'INTÉGRATION contre un vrai PostgreSQL : schéma SQL, chargement des
 * sorties KNIME (idempotence), requêtes du dépôt, API complète.
 *
 * Ignorés si TEST_DATABASE_URL n'est pas défini. Exemple (Docker Compose lancé) :
 *   PowerShell : $env:TEST_DATABASE_URL="postgres://transactions:transactions@localhost:5432/transactions"; npm run test:integration
 *
 * Les tables sont créées dans un SCHÉMA TEMPORAIRE (test_xxx) supprimé à la fin :
 * les données de la base ne sont pas modifiées.
 */
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { creerPool } = require('../../src/db/pool');
const { creerDepotTransactions } = require('../../src/repositories/transactionRepository');
const { charger } = require('../../src/scripts/load-csv');
const { creerApp } = require('../../src/app');
const { lireCsv } = require('../../src/utils/csv');
const { nouvelle } = require('../helpers/fixtures');

const URL = process.env.TEST_DATABASE_URL;
const RACINE = path.join(__dirname, '..', '..', '..');
const SCHEMA_SQL = path.join(RACINE, 'db', 'init', '01_schema.sql');
const DONNEES = path.join(RACINE, 'data', 'expected');
const decrire = URL ? describe : describe.skip;

decrire('PostgreSQL réel', () => {
  const schema = `test_${process.pid}_${Date.now()}`;
  let admin;
  let pool;
  let depot;
  let app;
  let attendus;

  beforeAll(async () => {
    admin = creerPool({ connectionString: URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = creerPool({ connectionString: URL, options: `-c search_path=${schema}` });
    await pool.query(fs.readFileSync(SCHEMA_SQL, 'utf8'));
    depot = creerDepotTransactions(pool);
    app = creerApp({ depot });
    attendus = lireCsv(path.join(DONNEES, 'transactions_valides.csv'));
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  test('chargement des sorties ETL : toutes les lignes valides insérées, rejets conservés', async () => {
    const resume = JSON.parse(fs.readFileSync(path.join(DONNEES, 'resume.json'), 'utf8'));
    const r = await charger(pool, DONNEES);
    expect(r).toMatchObject({
      valides_lues: resume.lignes_valides, inserees: resume.lignes_valides, mises_a_jour: 0,
      rejetees: resume.lignes_rejetees, rejets_au_chargement: 0, ecarts_categorie: 0
    });
  });

  test('chargement idempotent : relancé, il ne crée aucun doublon', async () => {
    const r = await charger(pool, DONNEES);
    expect(r.inserees).toBe(0);
    expect(r.mises_a_jour).toBe(attendus.length);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM transactions');
    expect(rows[0].n).toBe(attendus.length);
    const rej = await pool.query('SELECT COUNT(*)::int AS n FROM transactions_rejetees');
    expect(rej.rows[0].n).toBe(r.rejetees);
  });

  test('les contraintes SQL refusent une donnée invalide même sans passer par l\'API', async () => {
    await expect(pool.query(
      `INSERT INTO transactions (reference, compte_source, type, montant, date_transaction, statut, canal, categorie_montant)
       VALUES ('TXN-999999','CPT10000001','DEPOT',-5,'2026-01-01','EFFECTUEE','GAB','FAIBLE')`
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      `INSERT INTO transactions (reference, compte_source, type, montant, date_transaction, statut, canal, categorie_montant)
       VALUES ('TXN-999998','CPT10000001','VIREMENT',5,'2026-01-01','EFFECTUEE','GAB','FAIBLE')`
    )).rejects.toMatchObject({ code: '23514' });
  });

  test('filtres SQL : résultats identiques à un calcul direct sur le fichier ETL', async () => {
    const attenduVirementsXof = attendus.filter((t) => t.type === 'VIREMENT' && t.devise === 'XOF').length;
    const r = await request(app).get('/api/transactions?type=VIREMENT&devise=XOF&limite=1').expect(200);
    expect(r.body.pagination.total).toBe(attenduVirementsXof);

    const fev = attendus.filter((t) => t.date_transaction >= '2026-02-01T00:00:00' && t.date_transaction <= '2026-02-28T23:59:59'
      && Number(t.montant) >= 100000 && Number(t.montant) <= 500000).length;
    const r2 = await request(app).get('/api/transactions?date_debut=2026-02-01&date_fin=2026-02-28&montant_min=100000&montant_max=500000').expect(200);
    expect(r2.body.pagination.total).toBe(fev);
    expect(r2.body.donnees.every((t) => t.montant >= 100000 && t.montant <= 500000)).toBe(true);

    const compte = attendus[0].compte_source;
    const nCompte = attendus.filter((t) => t.compte_source === compte || t.compte_destination === compte).length;
    const r3 = await request(app).get(`/api/transactions?compte=${compte}`).expect(200);
    expect(r3.body.pagination.total).toBe(nCompte);
  });

  test('pagination et tri stables (pas de doublon entre pages)', async () => {
    const p1 = await request(app).get('/api/transactions?tri=montant&ordre=desc&limite=50&page=1').expect(200);
    const p2 = await request(app).get('/api/transactions?tri=montant&ordre=desc&limite=50&page=2').expect(200);
    const refs = [...p1.body.donnees, ...p2.body.donnees].map((t) => t.reference);
    expect(new Set(refs).size).toBe(100);
    const montants = [...p1.body.donnees, ...p2.body.donnees].map((t) => t.montant);
    expect(montants).toEqual([...montants].sort((a, b) => b - a));
  });

  test('types renvoyés : montant nombre, date ISO sans fuseau', async () => {
    const ref = attendus[0].reference;
    const r = await request(app).get(`/api/transactions/${ref}`).expect(200);
    expect(typeof r.body.montant).toBe('number');
    expect(r.body.date_transaction).toBe(attendus[0].date_transaction);
    expect(r.body.source).toBe('KNIME');
  });

  test('cycle complet POST -> GET -> PATCH -> DELETE', async () => {
    await request(app).post('/api/transactions').send(nouvelle()).expect(201);
    await request(app).post('/api/transactions').send(nouvelle()).expect(409);
    const p = await request(app).patch('/api/transactions/TXN-900001').send({ statut: 'EFFECTUEE', montant: 1500000 }).expect(200);
    expect(p.body).toMatchObject({ statut: 'EFFECTUEE', categorie_montant: 'ELEVE', source: 'API' });
    expect(new Date(p.body.modifie_le) >= new Date(p.body.cree_le)).toBe(true);
    await request(app).delete('/api/transactions/TXN-900001').expect(204);
    await request(app).get('/api/transactions/TXN-900001').expect(404);
  });

  test('un rechargement n\'écrase pas une transaction créée par l\'API', async () => {
    const ref = attendus[1].reference;
    await pool.query("UPDATE transactions SET source = 'API', statut = 'ANNULEE' WHERE reference = $1", [ref]);
    const r = await charger(pool, DONNEES);
    expect(r.ignorees_source_api).toBe(1);
    const t = await depot.trouver(ref);
    expect(t.statut).toBe('ANNULEE');
  });

  test('statistiques, rejets par motif et dernier chargement', async () => {
    const s = await request(app).get('/api/transactions/statistiques').expect(200);
    expect(s.body.donnees.reduce((n, g) => n + g.nombre, 0)).toBe(attendus.length);
    const resume = JSON.parse(fs.readFileSync(path.join(DONNEES, 'resume.json'), 'utf8'));
    const m = await request(app).get('/api/rejets/statistiques').expect(200);
    expect(m.body.total).toBe(resume.lignes_rejetees);
    const doublons = m.body.par_motif.find((x) => x.motif_rejet === 'DOUBLON_REFERENCE');
    expect(doublons.nombre).toBe(resume.rejets_par_motif.DOUBLON_REFERENCE);
    const c = await request(app).get('/api/chargements/dernier').expect(200);
    expect(c.body.lignes_rejetees).toBe(resume.lignes_rejetees);
  });
});
