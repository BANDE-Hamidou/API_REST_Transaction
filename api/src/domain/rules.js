'use strict';
/**
 * Règles métier d'une transaction, partagées par l'API et le script de chargement.
 * Elles reprennent le contrat commun (docs/CONTRATS.md) et le workflow KNIME.
 * Toute modification doit être reportée dans data/scripts/rules.js et dans KNIME.
 */
const TYPES = ['DEPOT', 'RETRAIT', 'VIREMENT', 'PAIEMENT'];
const DEVISES = ['XOF', 'EUR', 'USD'];
const STATUTS = ['EFFECTUEE', 'EN_ATTENTE', 'ANNULEE'];
const CANAUX = ['GUICHET', 'GAB', 'MOBILE', 'INTERNET'];
const CATEGORIES = ['FAIBLE', 'MOYEN', 'ELEVE'];
const SOURCES = ['KNIME', 'API'];

const RE_REFERENCE = /^TXN-[0-9]{6}$/;
const RE_COMPTE = /^CPT[0-9]{8}$/;
const RE_DATE_HEURE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTANT_MAX = 9999999999999.99; // NUMERIC(15,2)
const SEUIL_FAIBLE = 100000;
const SEUIL_ELEVE = 1000000;

function categorieMontant(montant) {
  if (montant < SEUIL_FAIBLE) return 'FAIBLE';
  if (montant < SEUIL_ELEVE) return 'MOYEN';
  return 'ELEVE';
}

/** Vérifie qu'une date existe vraiment (refuse 2026-02-30). */
function dateReelle(annee, mois, jour) {
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

function estDateHeureValide(v) {
  const m = RE_DATE_HEURE.exec(v);
  if (!m) return false;
  const [, a, mo, j, h, mi, s] = m.map(Number);
  return dateReelle(a, mo, j) && h <= 23 && mi <= 59 && s <= 59;
}

function estDateValide(v) {
  const m = RE_DATE.exec(v);
  return Boolean(m) && dateReelle(Number(m[1]), Number(m[2]), Number(m[3]));
}

module.exports = {
  TYPES, DEVISES, STATUTS, CANAUX, CATEGORIES, SOURCES,
  RE_REFERENCE, RE_COMPTE, MONTANT_MAX, SEUIL_FAIBLE, SEUIL_ELEVE,
  categorieMontant, estDateHeureValide, estDateValide
};
