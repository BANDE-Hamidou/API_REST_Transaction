'use strict';
/**
 * Dépôt EN MÉMOIRE ayant la même interface que src/repositories/transactionRepository.js.
 * Utilisé par les tests de l'API pour qu'ils tournent sans PostgreSQL.
 * Les requêtes SQL réelles sont testées dans tests/integration/ (PostgreSQL requis).
 */
const { erreurConflit } = require('../../src/errors');

const ENUMS = { type: 'type', statut: 'statut', canal: 'canal', devise: 'devise', categorie: 'categorie_montant', source: 'source' };

function correspond(t, f) {
  for (const [filtre, champ] of Object.entries(ENUMS)) if (f[filtre] && !f[filtre].includes(t[champ])) return false;
  if (f.compte && t.compte_source !== f.compte && t.compte_destination !== f.compte) return false;
  if (f.compte_source && t.compte_source !== f.compte_source) return false;
  if (f.compte_destination && t.compte_destination !== f.compte_destination) return false;
  if (f.date_debut && t.date_transaction < f.date_debut) return false;
  if (f.date_fin && t.date_transaction > f.date_fin) return false;
  if (f.montant_min !== undefined && t.montant < f.montant_min) return false;
  if (f.montant_max !== undefined && t.montant > f.montant_max) return false;
  return true;
}

function creerDepotMemoire({ transactions = [], rejets = [], chargement = null } = {}) {
  const donnees = new Map(transactions.map((t) => [t.reference, { source: 'KNIME', ...t }]));
  let enPanne = false;
  const verifier = () => { if (enPanne) { const e = new Error('connect ECONNREFUSED'); e.code = 'ECONNREFUSED'; throw e; } };

  return {
    simulerPanne(v = true) { enPanne = v; },
    async ping() { verifier(); },
    async rechercher({ filtres, page, limite, tri, ordre }) {
      verifier();
      const sens = ordre === 'asc' ? 1 : -1;
      const liste = [...donnees.values()].filter((t) => correspond(t, filtres)).sort((a, b) => {
        if (a[tri] < b[tri]) return -sens;
        if (a[tri] > b[tri]) return sens;
        return a.reference.localeCompare(b.reference);
      });
      return { lignes: liste.slice((page - 1) * limite, page * limite), total: liste.length };
    },
    async trouver(reference) { verifier(); return donnees.get(reference) || null; },
    async creer(t) {
      verifier();
      if (donnees.has(t.reference)) throw erreurConflit(`La transaction ${t.reference} existe déjà`);
      const ligne = { ...t, source: 'API' };
      donnees.set(t.reference, ligne);
      return ligne;
    },
    async modifier(reference, t) {
      verifier();
      if (!donnees.has(reference)) return null;
      const ligne = { ...donnees.get(reference), ...t, reference };
      donnees.set(reference, ligne);
      return ligne;
    },
    async supprimer(reference) { verifier(); return donnees.delete(reference); },
    async statistiques(filtres) {
      verifier();
      const groupes = new Map();
      for (const t of donnees.values()) {
        if (!correspond(t, filtres)) continue;
        const cle = `${t.type}|${t.devise}`;
        const g = groupes.get(cle) || { type: t.type, devise: t.devise, nombre: 0, montant_total: 0 };
        g.nombre++; g.montant_total += t.montant;
        groupes.set(cle, g);
      }
      return [...groupes.values()].map((g) => ({ ...g, montant_moyen: Math.round(g.montant_total / g.nombre * 100) / 100 }));
    },
    async rechercherRejets({ filtres, page, limite }) {
      verifier();
      const liste = rejets.filter((r) => !filtres.motif || r.motif_rejet === filtres.motif);
      return { lignes: liste.slice((page - 1) * limite, page * limite), total: liste.length };
    },
    async rejetsParMotif() {
      verifier();
      const c = {};
      for (const r of rejets) c[r.motif_rejet] = (c[r.motif_rejet] || 0) + 1;
      return Object.entries(c).map(([motif_rejet, nombre]) => ({ motif_rejet, nombre }));
    },
    async dernierChargement() { verifier(); return chargement; }
  };
}

module.exports = { creerDepotMemoire };
