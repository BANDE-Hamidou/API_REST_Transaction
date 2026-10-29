'use strict';
/**
 * Validation du corps des requêtes POST et PATCH /api/transactions.
 * Les textes sont normalisés (espaces retirés, majuscules pour les codes),
 * comme dans le workflow KNIME. Toutes les erreurs sont collectées puis
 * renvoyées ensemble (400 VALIDATION_ECHOUEE).
 */
const R = require('../domain/rules');
const { erreurValidation } = require('../errors');

const CHAMPS_SAISISSABLES = [
  'reference', 'compte_source', 'compte_destination', 'type', 'montant',
  'devise', 'date_transaction', 'statut', 'canal', 'description'
];
const CHAMPS_MODIFIABLES = CHAMPS_SAISISSABLES.filter((c) => c !== 'reference');

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const absent = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const code = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v);

/**
 * Valide une transaction complète et retourne sa version normalisée
 * (avec categorie_montant calculée). Lève une erreur 400 sinon.
 */
function validerTransaction(entree) {
  const erreurs = [];
  const err = (champ, message) => erreurs.push({ champ, message });
  const t = {};

  // reference
  if (absent(entree.reference)) err('reference', 'obligatoire');
  else if (typeof entree.reference !== 'string' || !R.RE_REFERENCE.test(code(entree.reference))) err('reference', 'format attendu TXN-000000 (6 chiffres)');
  else t.reference = code(entree.reference);

  // comptes
  if (absent(entree.compte_source)) err('compte_source', 'obligatoire');
  else if (typeof entree.compte_source !== 'string' || !R.RE_COMPTE.test(code(entree.compte_source))) err('compte_source', 'format attendu CPT suivi de 8 chiffres');
  else t.compte_source = code(entree.compte_source);

  if (absent(entree.compte_destination)) t.compte_destination = null;
  else if (typeof entree.compte_destination !== 'string' || !R.RE_COMPTE.test(code(entree.compte_destination))) err('compte_destination', 'format attendu CPT suivi de 8 chiffres');
  else t.compte_destination = code(entree.compte_destination);

  // énumérations
  const enumeration = (champ, valeurs, { obligatoire = true, defaut } = {}) => {
    if (absent(entree[champ])) {
      if (obligatoire) err(champ, 'obligatoire');
      else t[champ] = defaut;
    } else if (typeof entree[champ] !== 'string' || !valeurs.includes(code(entree[champ]))) {
      err(champ, `valeurs autorisées : ${valeurs.join(', ')}`);
    } else {
      t[champ] = code(entree[champ]);
    }
  };
  enumeration('type', R.TYPES);
  enumeration('devise', R.DEVISES, { obligatoire: false, defaut: 'XOF' });
  enumeration('statut', R.STATUTS, { obligatoire: false, defaut: 'EN_ATTENTE' });
  enumeration('canal', R.CANAUX);

  // montant : nombre JSON strictement positif, 2 décimales maximum
  if (absent(entree.montant)) err('montant', 'obligatoire');
  else if (typeof entree.montant !== 'number' || !Number.isFinite(entree.montant)) err('montant', 'doit être un nombre');
  else if (entree.montant <= 0) err('montant', 'doit être strictement positif');
  else if (entree.montant > R.MONTANT_MAX) err('montant', `ne doit pas dépasser ${R.MONTANT_MAX}`);
  else if (Math.abs(Math.round(entree.montant * 100) - entree.montant * 100) > 1e-6) err('montant', '2 décimales maximum');
  else t.montant = entree.montant;

  // date
  if (absent(entree.date_transaction)) err('date_transaction', 'obligatoire');
  else if (typeof entree.date_transaction !== 'string' || !R.estDateHeureValide(entree.date_transaction.trim())) err('date_transaction', 'format attendu AAAA-MM-JJThh:mm:ss (date réelle)');
  else t.date_transaction = entree.date_transaction.trim();

  // description
  if (absent(entree.description)) t.description = null;
  else if (typeof entree.description !== 'string') err('description', 'doit être une chaîne');
  else if (entree.description.trim().length > 255) err('description', '255 caractères maximum');
  else t.description = entree.description.trim();

  // règles inter-champs
  if (t.type === 'VIREMENT' && t.compte_destination === null && !erreurs.some((e) => e.champ === 'compte_destination')) {
    err('compte_destination', 'obligatoire pour un VIREMENT');
  }
  if (t.compte_destination && t.compte_destination === t.compte_source) {
    err('compte_destination', 'doit être différent du compte source');
  }

  if (erreurs.length) throw erreurValidation(erreurs);
  t.categorie_montant = R.categorieMontant(t.montant);
  return t;
}

function verifierChampsConnus(corps, autorises) {
  const inconnus = Object.keys(corps).filter((c) => !autorises.includes(c));
  if (inconnus.length) {
    throw erreurValidation(inconnus.map((c) => ({ champ: c, message: 'champ inconnu ou non modifiable' })));
  }
}

/** POST : le corps doit contenir une transaction complète. */
function validerCreation(corps) {
  if (!estObjet(corps)) throw erreurValidation([{ champ: 'corps', message: 'objet JSON attendu (Content-Type: application/json)' }]);
  verifierChampsConnus(corps, CHAMPS_SAISISSABLES);
  return validerTransaction(corps);
}

/**
 * PATCH : modification partielle. Les champs fournis sont fusionnés avec la
 * transaction existante, puis l'ensemble est revalidé (cohérence garantie).
 */
function validerModification(existante, corps) {
  if (!estObjet(corps) || Object.keys(corps).length === 0) {
    throw erreurValidation([{ champ: 'corps', message: 'objet JSON non vide attendu' }]);
  }
  verifierChampsConnus(corps, CHAMPS_MODIFIABLES);
  const fusion = {};
  for (const c of CHAMPS_SAISISSABLES) fusion[c] = existante[c];
  Object.assign(fusion, corps);
  return validerTransaction(fusion);
}

module.exports = { validerTransaction, validerCreation, validerModification, CHAMPS_SAISISSABLES, CHAMPS_MODIFIABLES };
