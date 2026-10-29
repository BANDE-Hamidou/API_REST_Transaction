'use strict';
/**
 * Accès PostgreSQL. Les routes ne connaissent que ces méthodes : on peut donc
 * tester l'API avec un dépôt en mémoire (tests/helpers/memoryRepository.js)
 * qui expose exactement la même interface.
 */
const { construireRecherche, construireWhere } = require('./queryBuilder');
const { erreurConflit } = require('../errors');

const COLONNES = `reference, compte_source, compte_destination, type, montant, devise,
  date_transaction, statut, canal, description, categorie_montant, source, cree_le, modifie_le`;
const COLONNES_REJET = `id, reference, compte_source, compte_destination, type, montant, devise,
  date_transaction, statut, canal, description, motif_rejet, chargement_id, rejete_le`;

function creerDepotTransactions(pool) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },

    async rechercher(requete) {
      const { sql, params, sqlCompte, paramsCompte } = construireRecherche(requete, COLONNES);
      const [lignes, compte] = await Promise.all([pool.query(sql, params), pool.query(sqlCompte, paramsCompte)]);
      return { lignes: lignes.rows, total: compte.rows[0].total };
    },

    async trouver(reference) {
      const r = await pool.query(`SELECT ${COLONNES} FROM transactions WHERE reference = $1`, [reference]);
      return r.rows[0] || null;
    },

    async creer(t) {
      try {
        const r = await pool.query(
          `INSERT INTO transactions (reference, compte_source, compte_destination, type, montant, devise,
             date_transaction, statut, canal, description, categorie_montant, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'API') RETURNING ${COLONNES}`,
          [t.reference, t.compte_source, t.compte_destination, t.type, t.montant, t.devise,
            t.date_transaction, t.statut, t.canal, t.description, t.categorie_montant]
        );
        return r.rows[0];
      } catch (e) {
        if (e.code === '23505') throw erreurConflit(`La transaction ${t.reference} existe déjà`);
        throw e;
      }
    },

    async modifier(reference, t) {
      const r = await pool.query(
        `UPDATE transactions SET compte_source=$2, compte_destination=$3, type=$4, montant=$5, devise=$6,
           date_transaction=$7, statut=$8, canal=$9, description=$10, categorie_montant=$11
         WHERE reference = $1 RETURNING ${COLONNES}`,
        [reference, t.compte_source, t.compte_destination, t.type, t.montant, t.devise,
          t.date_transaction, t.statut, t.canal, t.description, t.categorie_montant]
      );
      return r.rows[0] || null;
    },

    async supprimer(reference) {
      const r = await pool.query('DELETE FROM transactions WHERE reference = $1', [reference]);
      return r.rowCount > 0;
    },

    async statistiques(filtres) {
      const { where, params } = construireWhere(filtres);
      const r = await pool.query(
        `SELECT type, devise, COUNT(*)::int AS nombre, SUM(montant) AS montant_total,
                ROUND(AVG(montant), 2) AS montant_moyen
         FROM transactions ${where} GROUP BY type, devise ORDER BY type, devise`,
        params
      );
      return r.rows;
    },

    async rechercherRejets({ filtres, page, limite }) {
      const params = [];
      let where = '';
      if (filtres.motif) { params.push(filtres.motif); where = 'WHERE motif_rejet = $1'; }
      const [lignes, compte] = await Promise.all([
        pool.query(`SELECT ${COLONNES_REJET} FROM transactions_rejetees ${where} ORDER BY id
                    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limite, (page - 1) * limite]),
        pool.query(`SELECT COUNT(*)::int AS total FROM transactions_rejetees ${where}`, params)
      ]);
      return { lignes: lignes.rows, total: compte.rows[0].total };
    },

    async rejetsParMotif() {
      const r = await pool.query(
        'SELECT motif_rejet, COUNT(*)::int AS nombre FROM transactions_rejetees GROUP BY motif_rejet ORDER BY nombre DESC, motif_rejet'
      );
      return r.rows;
    },

    async dernierChargement() {
      const r = await pool.query('SELECT * FROM chargements ORDER BY id DESC LIMIT 1');
      return r.rows[0] || null;
    }
  };
}

module.exports = { creerDepotTransactions };
