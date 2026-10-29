'use strict';
/**
 * Construction des requêtes SQL de recherche à partir des filtres validés.
 * Toutes les valeurs passent par des paramètres ($1, $2...) : aucune
 * concaténation de saisie utilisateur, donc pas d'injection SQL possible.
 * Le tri n'accepte que des colonnes de la liste blanche.
 */
const COLONNES_TRI = { date_transaction: 'date_transaction', montant: 'montant', reference: 'reference' };
const COLONNES_ENUM = { type: 'type', statut: 'statut', canal: 'canal', devise: 'devise', categorie: 'categorie_montant', source: 'source' };

function construireWhere(filtres = {}) {
  const conditions = [];
  const params = [];
  const p = (valeur) => { params.push(valeur); return `$${params.length}`; };

  for (const [filtre, colonne] of Object.entries(COLONNES_ENUM)) {
    if (filtres[filtre]) conditions.push(`${colonne} = ANY(${p(filtres[filtre])}::text[])`);
  }
  if (filtres.compte) {
    const x = p(filtres.compte);
    conditions.push(`(compte_source = ${x} OR compte_destination = ${x})`);
  }
  if (filtres.compte_source) conditions.push(`compte_source = ${p(filtres.compte_source)}`);
  if (filtres.compte_destination) conditions.push(`compte_destination = ${p(filtres.compte_destination)}`);
  if (filtres.date_debut) conditions.push(`date_transaction >= ${p(filtres.date_debut)}::timestamp`);
  if (filtres.date_fin) conditions.push(`date_transaction <= ${p(filtres.date_fin)}::timestamp`);
  if (filtres.montant_min !== undefined) conditions.push(`montant >= ${p(filtres.montant_min)}`);
  if (filtres.montant_max !== undefined) conditions.push(`montant <= ${p(filtres.montant_max)}`);

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function construireTri(tri = 'date_transaction', ordre = 'desc') {
  const colonne = COLONNES_TRI[tri];
  if (!colonne) throw new Error(`Tri non autorisé : ${tri}`);
  const sens = ordre === 'asc' ? 'ASC' : 'DESC';
  // la référence départage les ex aequo : pagination stable
  return colonne === 'reference' ? `ORDER BY reference ${sens}` : `ORDER BY ${colonne} ${sens}, reference ASC`;
}

function construireRecherche({ filtres, page, limite, tri, ordre }, colonnes) {
  const { where, params } = construireWhere(filtres);
  const n = params.length;
  return {
    sql: `SELECT ${colonnes} FROM transactions ${where} ${construireTri(tri, ordre)} LIMIT $${n + 1} OFFSET $${n + 2}`,
    params: [...params, limite, (page - 1) * limite],
    sqlCompte: `SELECT COUNT(*)::int AS total FROM transactions ${where}`,
    paramsCompte: params
  };
}

module.exports = { construireWhere, construireTri, construireRecherche };
