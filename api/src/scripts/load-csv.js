#!/usr/bin/env node
'use strict';
/**
 * Chargement des sorties du workflow KNIME dans PostgreSQL.
 *
 *   transactions_valides.csv   -> table transactions (source = 'KNIME')
 *   transactions_rejetees.csv  -> table transactions_rejetees (remplacée à chaque chargement)
 *   compte rendu               -> table chargements
 *
 * IDEMPOTENT : relancer le chargement avec les mêmes fichiers ne crée aucun doublon
 * (INSERT ... ON CONFLICT (reference) DO UPDATE). Les transactions créées par
 * l'API (source = 'API') ne sont jamais écrasées.
 * Chaque ligne valide est revalidée avec les règles de l'API (défense en profondeur) :
 * une ligne refusée est ajoutée aux rejets avec le motif REJET_CHARGEMENT.
 * Tout se fait dans UNE transaction SQL : en cas d'erreur, rien n'est modifié.
 *
 * Usage :
 *   dans Docker : docker compose exec api npm run load -- /data/processed
 *   en local    : cd api && npm run load:local -- ../data/processed
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { creerPool } = require('../db/pool');
const { lireCsv } = require('../utils/csv');
const { validerTransaction } = require('../validation/transaction');

const TAILLE_LOT = 500;
const COLS_REJET = ['reference', 'compte_source', 'compte_destination', 'type', 'montant', 'devise',
  'date_transaction', 'statut', 'canal', 'description', 'motif_rejet'];

/** Prépare les lignes : conversion des types, revalidation. Fonction pure (testée). */
function preparer(valides, rejetees) {
  const aInserer = [];
  const rejetsChargement = [];
  const ecartsCategorie = [];
  for (const l of valides) {
    try {
      const montant = l.montant === '' ? null : Number(l.montant);
      const t = validerTransaction({ ...l, montant, categorie_montant: undefined });
      if (l.categorie_montant && l.categorie_montant !== t.categorie_montant) ecartsCategorie.push(t.reference);
      aInserer.push(t);
    } catch (e) {
      const champs = (e.details || []).map((d) => d.champ).join('+') || 'inconnu';
      rejetsChargement.push({ ...l, motif_rejet: `REJET_CHARGEMENT:${champs}`.slice(0, 40) });
    }
  }
  // une même référence deux fois dans le fichier : on garde la première
  const vues = new Set();
  const uniques = [];
  for (const t of aInserer) {
    if (vues.has(t.reference)) rejetsChargement.push({ ...t, motif_rejet: 'REJET_CHARGEMENT:doublon' });
    else { vues.add(t.reference); uniques.push(t); }
  }
  return { aInserer: uniques, rejets: [...rejetees, ...rejetsChargement], rejetsChargement, ecartsCategorie };
}

async function inserer(client, lignes) {
  let inserees = 0;
  let majs = 0;
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const lot = lignes.slice(i, i + TAILLE_LOT);
    const params = [];
    const valeurs = lot.map((t) => {
      const base = params.length;
      params.push(t.reference, t.compte_source, t.compte_destination, t.type, t.montant, t.devise,
        t.date_transaction, t.statut, t.canal, t.description, t.categorie_montant);
      return `(${Array.from({ length: 11 }, (_, k) => `$${base + k + 1}`).join(',')},'KNIME')`;
    });
    const r = await client.query(
      `INSERT INTO transactions (reference, compte_source, compte_destination, type, montant, devise,
         date_transaction, statut, canal, description, categorie_montant, source)
       VALUES ${valeurs.join(',')}
       ON CONFLICT (reference) DO UPDATE SET
         compte_source = EXCLUDED.compte_source, compte_destination = EXCLUDED.compte_destination,
         type = EXCLUDED.type, montant = EXCLUDED.montant, devise = EXCLUDED.devise,
         date_transaction = EXCLUDED.date_transaction, statut = EXCLUDED.statut, canal = EXCLUDED.canal,
         description = EXCLUDED.description, categorie_montant = EXCLUDED.categorie_montant
       WHERE transactions.source = 'KNIME'
       RETURNING (xmax = 0) AS inseree`,
      params
    );
    for (const row of r.rows) { if (row.inseree) inserees++; else majs++; }
  }
  return { inserees, majs };
}

async function insererRejets(client, rejets, chargementId) {
  await client.query('DELETE FROM transactions_rejetees');
  for (let i = 0; i < rejets.length; i += TAILLE_LOT) {
    const lot = rejets.slice(i, i + TAILLE_LOT);
    const params = [];
    const valeurs = lot.map((l) => {
      const base = params.length;
      for (const c of COLS_REJET) params.push(l[c] === '' || l[c] === undefined || l[c] === null ? null : String(l[c]));
      params.push(chargementId);
      return `(${Array.from({ length: COLS_REJET.length + 1 }, (_, k) => `$${base + k + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO transactions_rejetees (${COLS_REJET.join(', ')}, chargement_id) VALUES ${valeurs.join(',')}`,
      params
    );
  }
}

async function charger(pool, dossier) {
  const fValides = path.join(dossier, 'transactions_valides.csv');
  const fRejets = path.join(dossier, 'transactions_rejetees.csv');
  for (const f of [fValides, fRejets]) {
    if (!fs.existsSync(f)) throw new Error(`Fichier introuvable : ${f} (le workflow KNIME a-t-il été exécuté ?)`);
  }
  const valides = lireCsv(fValides);
  const rejetees = lireCsv(fRejets);
  const debut = new Date();
  const { aInserer, rejets, rejetsChargement, ecartsCategorie } = preparer(valides, rejetees);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const c = await client.query(
      `INSERT INTO chargements (dossier_source, lignes_valides_lues, lignes_inserees, lignes_mises_a_jour,
         lignes_rejetees, rejets_au_chargement, debut) VALUES ($1,$2,0,0,0,0,$3) RETURNING id`,
      [dossier, valides.length, debut]
    );
    const id = c.rows[0].id;
    const { inserees, majs } = await inserer(client, aInserer);
    await insererRejets(client, rejets, id);
    await client.query(
      `UPDATE chargements SET lignes_inserees=$2, lignes_mises_a_jour=$3, lignes_rejetees=$4,
         rejets_au_chargement=$5, fin=now() WHERE id=$1`,
      [id, inserees, majs, rejets.length, rejetsChargement.length]
    );
    await client.query('COMMIT');
    return {
      chargement_id: id, valides_lues: valides.length, inserees, mises_a_jour: majs,
      ignorees_source_api: aInserer.length - inserees - majs,
      rejetees: rejets.length, rejets_au_chargement: rejetsChargement.length, ecarts_categorie: ecartsCategorie.length
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const dossier = path.resolve(process.argv[2] || process.env.DOSSIER_DONNEES || '/data/processed');
  const pool = creerPool(config.db);
  console.log(`[chargement] lecture de ${dossier}`);
  charger(pool, dossier)
    .then((r) => {
      console.log('[chargement] terminé :', JSON.stringify(r, null, 2));
      if (r.rejets_au_chargement) console.warn(`[chargement] ATTENTION : ${r.rejets_au_chargement} ligne(s) "valides" refusées par l'API`);
      if (r.ecarts_categorie) console.warn(`[chargement] ATTENTION : ${r.ecarts_categorie} catégorie(s) recalculée(s)`);
    })
    .catch((e) => { console.error(`[chargement] ÉCHEC : ${e.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { charger, preparer };
