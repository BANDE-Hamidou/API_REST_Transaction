'use strict';
/**
 * Règles de contrôle et de transformation des transactions.
 *
 * Ce fichier est la traduction JavaScript EXACTE du workflow KNIME décrit dans
 * docs/KNIME_WORKFLOW.md. Il sert :
 *   - à produire les résultats attendus (data/expected/) ;
 *   - à vérifier que la sortie du workflow KNIME est correcte (compare-outputs.js).
 *
 * Toute modification d'une règle doit être faite AUX TROIS ENDROITS :
 * ce fichier, le workflow KNIME (docs/KNIME_WORKFLOW.md) et api/src/domain/rules.js.
 */

const COLONNES_BRUTES = [
  'reference', 'compte_source', 'compte_destination', 'type', 'montant',
  'devise', 'date_transaction', 'statut', 'canal', 'description'
];

const COLONNES_VALIDES = [...COLONNES_BRUTES, 'categorie_montant'];
const COLONNES_REJETEES = [...COLONNES_BRUTES, 'motif_rejet'];

const TYPES = ['DEPOT', 'RETRAIT', 'VIREMENT', 'PAIEMENT'];
const DEVISES = ['XOF', 'EUR', 'USD'];
const STATUTS = ['EFFECTUEE', 'EN_ATTENTE', 'ANNULEE'];
const CANAUX = ['GUICHET', 'GAB', 'MOBILE', 'INTERNET'];

const RE_REFERENCE = /^TXN-[0-9]{6}$/;
const RE_COMPTE = /^CPT[0-9]{8}$/;
const RE_MONTANT = /^[0-9]+(\.[0-9]{1,2})?$/;
const RE_MONTANT_NUL = /^0+(\.0+)?$/;
const RE_DATE = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
// identique au Rule Engine KNIME : [0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2}
const RE_DATE_FR = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4}) ([0-9]{2}:[0-9]{2}:[0-9]{2})$/;

const SEUIL_FAIBLE = 100000;
const SEUIL_ELEVE = 1000000;

const estVide = (v) => v === null || v === undefined || v === '';

/** Équivalent de upperCase(strip(x)) dans KNIME String Manipulation. */
const majusculesSansEspaces = (v) => (estVide(v) ? null : String(v).trim().toUpperCase() || null);

/**
 * Étape « Normalisation » (nœuds String Manipulation du workflow KNIME).
 * Les valeurs vides deviennent null (valeur manquante KNIME).
 */
function normaliser(ligne) {
  const n = {};
  n.reference = majusculesSansEspaces(ligne.reference);
  n.compte_source = majusculesSansEspaces(ligne.compte_source);
  n.compte_destination = majusculesSansEspaces(ligne.compte_destination);
  n.type = majusculesSansEspaces(ligne.type);
  n.devise = majusculesSansEspaces(ligne.devise);
  n.statut = majusculesSansEspaces(ligne.statut);
  n.canal = majusculesSansEspaces(ligne.canal);
  // montant : suppression des espaces puis virgule décimale -> point
  n.montant = estVide(ligne.montant) ? null : String(ligne.montant).trim().replace(/ /g, '').replace(/,/g, '.') || null;
  // date : format français JJ/MM/AAAA hh:mm:ss -> ISO AAAA-MM-JJThh:mm:ss
  n.date_transaction = estVide(ligne.date_transaction)
    ? null
    : String(ligne.date_transaction).trim().replace(RE_DATE_FR, '$3-$2-$1T$4') || null;
  n.description = estVide(ligne.description) ? null : String(ligne.description).trim() || null;
  return n;
}

/**
 * Étape « Contrôle » (nœud Rule Engine). Les règles sont évaluées dans l'ordre :
 * la PREMIÈRE règle vérifiée donne le motif. Retourne 'OK' si tout est valide.
 */
function motifRejet(n) {
  if (estVide(n.reference)) return 'REFERENCE_MANQUANTE';
  if (!RE_REFERENCE.test(n.reference)) return 'REFERENCE_INVALIDE';
  if (estVide(n.compte_source)) return 'COMPTE_SOURCE_MANQUANT';
  if (!RE_COMPTE.test(n.compte_source)) return 'COMPTE_SOURCE_INVALIDE';
  if (estVide(n.type)) return 'TYPE_MANQUANT';
  if (!TYPES.includes(n.type)) return 'TYPE_INVALIDE';
  if (estVide(n.montant)) return 'MONTANT_MANQUANT';
  if (n.montant.startsWith('-')) return 'MONTANT_NEGATIF';
  if (!RE_MONTANT.test(n.montant)) return 'MONTANT_NON_NUMERIQUE';
  if (RE_MONTANT_NUL.test(n.montant)) return 'MONTANT_NUL';
  if (estVide(n.devise) || !DEVISES.includes(n.devise)) return 'DEVISE_INVALIDE';
  if (estVide(n.date_transaction)) return 'DATE_MANQUANTE';
  if (!RE_DATE.test(n.date_transaction)) return 'DATE_INVALIDE';
  if (estVide(n.statut) || !STATUTS.includes(n.statut)) return 'STATUT_INVALIDE';
  if (estVide(n.canal) || !CANAUX.includes(n.canal)) return 'CANAL_INVALIDE';
  if (n.type === 'VIREMENT' && estVide(n.compte_destination)) return 'DESTINATION_MANQUANTE';
  if (!estVide(n.compte_destination) && !RE_COMPTE.test(n.compte_destination)) return 'DESTINATION_INVALIDE';
  if (!estVide(n.compte_destination) && n.compte_destination === n.compte_source) return 'COMPTES_IDENTIQUES';
  return 'OK';
}

/** Étape « Enrichissement » : catégorie calculée à partir du montant. */
function categorieMontant(montant) {
  const m = Number(montant);
  if (m < SEUIL_FAIBLE) return 'FAIBLE';
  if (m < SEUIL_ELEVE) return 'MOYEN';
  return 'ELEVE';
}

/**
 * Traitement complet d'un lot : normalisation, contrôle, détection des doublons
 * (parmi les lignes valides, la première occurrence d'une référence est conservée),
 * enrichissement. Reproduit le workflow KNIME de bout en bout.
 */
function traiterLot(lignesBrutes) {
  const valides = [];
  const rejetees = [];
  const referencesVues = new Set();

  for (const brute of lignesBrutes) {
    const n = normaliser(brute);
    let motif = motifRejet(n);
    if (motif === 'OK') {
      if (referencesVues.has(n.reference)) motif = 'DOUBLON_REFERENCE';
      else referencesVues.add(n.reference);
    }
    if (motif === 'OK') {
      valides.push({ ...n, montant: Number(n.montant), categorie_montant: categorieMontant(n.montant) });
    } else {
      rejetees.push({ ...n, motif_rejet: motif });
    }
  }
  return { valides, rejetees };
}

module.exports = {
  COLONNES_BRUTES, COLONNES_VALIDES, COLONNES_REJETEES,
  TYPES, DEVISES, STATUTS, CANAUX,
  RE_REFERENCE, RE_COMPTE, RE_MONTANT, RE_DATE,
  SEUIL_FAIBLE, SEUIL_ELEVE,
  normaliser, motifRejet, categorieMontant, traiterLot
};
