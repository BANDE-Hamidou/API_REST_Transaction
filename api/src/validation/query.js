'use strict';
/**
 * Validation des paramètres de requête (filtres, pagination, tri).
 * Un paramètre inconnu ou mal formé provoque une erreur 400 : cela évite qu'une
 * faute de frappe (ex. ?tpye=DEPOT) renvoie silencieusement toutes les transactions.
 */
const R = require('../domain/rules');
const config = require('../config');
const { erreurValidation } = require('../errors');

const FILTRES_ENUM = {
  type: R.TYPES,
  statut: R.STATUTS,
  canal: R.CANAUX,
  devise: R.DEVISES,
  categorie: R.CATEGORIES,
  source: R.SOURCES
};
const TRIS = ['date_transaction', 'montant', 'reference'];
const PARAMETRES_TRANSACTIONS = [
  ...Object.keys(FILTRES_ENUM), 'compte', 'compte_source', 'compte_destination',
  'date_debut', 'date_fin', 'montant_min', 'montant_max', 'page', 'limite', 'tri', 'ordre'
];

function lirePagination(q, erreurs) {
  const entier = (nom, defaut, min, max) => {
    if (q[nom] === undefined) return defaut;
    const n = Number(q[nom]);
    if (!/^\d+$/.test(String(q[nom])) || n < min || n > max) {
      erreurs.push({ champ: nom, message: `entier entre ${min} et ${max} attendu` });
      return defaut;
    }
    return n;
  };
  return {
    page: entier('page', 1, 1, 1000000),
    limite: entier('limite', config.pagination.limiteParDefaut, 1, config.pagination.limiteMax)
  };
}

function verifierInconnus(q, autorises) {
  const inconnus = Object.keys(q).filter((k) => !autorises.includes(k));
  return inconnus.map((k) => ({ champ: k, message: `paramètre inconnu (autorisés : ${autorises.join(', ')})` }));
}

/** Paramètres de GET /api/transactions (et /statistiques pour les filtres). */
function lireRequeteTransactions(q) {
  const erreurs = verifierInconnus(q, PARAMETRES_TRANSACTIONS);
  const filtres = {};

  for (const [nom, valeurs] of Object.entries(FILTRES_ENUM)) {
    if (q[nom] === undefined) continue;
    // valeurs multiples séparées par des virgules : ?type=DEPOT,RETRAIT
    const liste = String(q[nom]).split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
    const invalides = liste.filter((v) => !valeurs.includes(v));
    if (!liste.length || invalides.length) erreurs.push({ champ: nom, message: `valeurs autorisées : ${valeurs.join(', ')}` });
    else filtres[nom] = liste;
  }

  for (const nom of ['compte', 'compte_source', 'compte_destination']) {
    if (q[nom] === undefined) continue;
    const v = String(q[nom]).trim().toUpperCase();
    if (!R.RE_COMPTE.test(v)) erreurs.push({ champ: nom, message: 'format attendu CPT suivi de 8 chiffres' });
    else filtres[nom] = v;
  }

  // dates : AAAA-MM-JJ (journée entière) ou AAAA-MM-JJThh:mm:ss
  const lireDate = (nom, finDeJournee) => {
    if (q[nom] === undefined) return;
    const v = String(q[nom]).trim();
    if (R.estDateValide(v)) filtres[nom] = `${v}T${finDeJournee ? '23:59:59' : '00:00:00'}`;
    else if (R.estDateHeureValide(v)) filtres[nom] = v;
    else erreurs.push({ champ: nom, message: 'format attendu AAAA-MM-JJ ou AAAA-MM-JJThh:mm:ss' });
  };
  lireDate('date_debut', false);
  lireDate('date_fin', true);
  if (filtres.date_debut && filtres.date_fin && filtres.date_debut > filtres.date_fin) {
    erreurs.push({ champ: 'date_fin', message: 'doit être postérieure ou égale à date_debut' });
  }

  for (const nom of ['montant_min', 'montant_max']) {
    if (q[nom] === undefined) continue;
    const n = Number(q[nom]);
    if (String(q[nom]).trim() === '' || !Number.isFinite(n) || n < 0) erreurs.push({ champ: nom, message: 'nombre positif attendu' });
    else filtres[nom] = n;
  }
  if (filtres.montant_min !== undefined && filtres.montant_max !== undefined && filtres.montant_min > filtres.montant_max) {
    erreurs.push({ champ: 'montant_max', message: 'doit être supérieur ou égal à montant_min' });
  }

  const { page, limite } = lirePagination(q, erreurs);

  const tri = q.tri === undefined ? 'date_transaction' : String(q.tri);
  if (!TRIS.includes(tri)) erreurs.push({ champ: 'tri', message: `valeurs autorisées : ${TRIS.join(', ')}` });
  const ordre = q.ordre === undefined ? 'desc' : String(q.ordre).toLowerCase();
  if (!['asc', 'desc'].includes(ordre)) erreurs.push({ champ: 'ordre', message: 'valeurs autorisées : asc, desc' });

  if (erreurs.length) throw erreurValidation(erreurs, 'Paramètres de requête invalides');
  return { filtres, page, limite, tri, ordre };
}

/** Paramètres de GET /api/rejets. */
function lireRequeteRejets(q) {
  const erreurs = verifierInconnus(q, ['motif', 'page', 'limite']);
  const filtres = {};
  if (q.motif !== undefined) {
    const m = String(q.motif).trim().toUpperCase();
    if (!/^[A-Z_:]{3,40}$/.test(m)) erreurs.push({ champ: 'motif', message: 'code de motif attendu (ex. MONTANT_NEGATIF)' });
    else filtres.motif = m;
  }
  const { page, limite } = lirePagination(q, erreurs);
  if (erreurs.length) throw erreurValidation(erreurs, 'Paramètres de requête invalides');
  return { filtres, page, limite };
}

/** Paramètre de chemin :reference. */
function lireReference(valeur) {
  const v = String(valeur).trim().toUpperCase();
  if (!R.RE_REFERENCE.test(v)) throw erreurValidation([{ champ: 'reference', message: 'format attendu TXN-000000' }]);
  return v;
}

module.exports = { lireRequeteTransactions, lireRequeteRejets, lireReference, TRIS, PARAMETRES_TRANSACTIONS };
