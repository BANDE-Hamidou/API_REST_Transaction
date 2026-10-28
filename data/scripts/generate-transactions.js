#!/usr/bin/env node
'use strict';
/**
 * Générateur de transactions bancaires FICTIVES (étape 1 de l'exercice 6).
 *
 * Produit :
 *   data/raw/transactions_brutes.csv   -> entrée du workflow KNIME
 *   data/raw/anomalies_injectees.json  -> liste des anomalies volontaires (pour vérifier KNIME)
 *
 * Le générateur est DÉTERMINISTE : avec la même graine, le même fichier est produit.
 * Toute l'équipe travaille donc sur les mêmes données.
 *
 * Usage : node data/scripts/generate-transactions.js [--nombre 1000] [--graine 2026] [--sortie data/raw]
 */
const fs = require('node:fs');
const path = require('node:path');
const { COLONNES_BRUTES } = require('./rules');
const { ecrireCsv } = require('./csv');

// ---------------------------------------------------------------- paramètres
function lireArguments(argv) {
  const args = { nombre: 1000, graine: 2026, sortie: path.join(__dirname, '..', 'raw') };
  for (let i = 0; i < argv.length; i += 2) {
    const cle = argv[i].replace(/^--/, '');
    if (!(cle in args)) throw new Error(`Argument inconnu : ${argv[i]}`);
    args[cle] = cle === 'sortie' ? path.resolve(argv[i + 1]) : Number(argv[i + 1]);
  }
  if (!Number.isInteger(args.nombre) || args.nombre < 200) throw new Error('--nombre doit être un entier >= 200');
  return args;
}

// ---------------------------------------------------------------- hasard reproductible
function mulberry32(graine) {
  let a = graine >>> 0;
  return function aleatoire() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function creerOutils(aleatoire) {
  const entier = (min, max) => Math.floor(aleatoire() * (max - min + 1)) + min;
  const choix = (liste) => liste[Math.floor(aleatoire() * liste.length)];
  const pondere = (paires) => {
    const total = paires.reduce((s, [, p]) => s + p, 0);
    let r = aleatoire() * total;
    for (const [v, p] of paires) { if ((r -= p) < 0) return v; }
    return paires[paires.length - 1][0];
  };
  return { entier, choix, pondere };
}

const pad = (n, l = 2) => String(n).padStart(l, '0');
const formatIso = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

// ---------------------------------------------------------------- référentiel fictif
const DESCRIPTIONS = {
  DEPOT: ['Depot especes', 'Depot salaire', 'Versement epargne'],
  RETRAIT: ['Retrait especes', 'Retrait GAB'],
  VIREMENT: ['Virement loyer', 'Transfert familial', 'Virement fournisseur', 'Remboursement pret'],
  PAIEMENT: ['Paiement facture electricite', 'Paiement facture eau', 'Achat marchand', 'Paiement scolarite', 'Recharge credit telephonique']
};
const CANAUX_PAR_TYPE = {
  DEPOT: ['GUICHET', 'MOBILE'],
  RETRAIT: ['GUICHET', 'GAB'],
  VIREMENT: ['GUICHET', 'MOBILE', 'INTERNET'],
  PAIEMENT: ['MOBILE', 'INTERNET']
};

function genererTransactionsValides(nombre, o) {
  const clients = Array.from({ length: 150 }, (_, i) => `CPT1${pad(i + 1, 7)}`);
  const marchands = Array.from({ length: 20 }, (_, i) => `CPT9${pad(i + 1, 7)}`);
  const debut = Date.UTC(2026, 0, 1);
  const fin = Date.UTC(2026, 8, 30, 23, 59, 59);

  const lignes = [];
  for (let i = 0; i < nombre; i++) {
    const type = o.pondere([['DEPOT', 25], ['RETRAIT', 25], ['VIREMENT', 30], ['PAIEMENT', 20]]);
    const devise = o.pondere([['XOF', 90], ['EUR', 7], ['USD', 3]]);
    const source = o.choix(clients);
    let destination = '';
    if (type === 'VIREMENT') { do { destination = o.choix(clients); } while (destination === source); }
    if (type === 'PAIEMENT') destination = o.choix(marchands);

    // Montant : répartition log-uniforme (beaucoup de petits montants, quelques gros)
    let montant;
    if (devise === 'XOF') {
      montant = Math.round(Math.exp(Math.log(500) + o.entier(0, 10000) / 10000 * (Math.log(5000000) - Math.log(500))) / 50) * 50;
    } else {
      montant = Math.round(Math.exp(Math.log(5) + o.entier(0, 10000) / 10000 * (Math.log(8000) - Math.log(5))) * 100) / 100;
    }

    lignes.push({
      reference: '',
      compte_source: source,
      compte_destination: destination,
      type,
      montant: montant.toFixed(2),
      devise,
      date_transaction: formatIso(new Date(debut + Math.floor(o.entier(0, 1e9) / 1e9 * (fin - debut)))),
      statut: o.pondere([['EFFECTUEE', 85], ['EN_ATTENTE', 10], ['ANNULEE', 5]]),
      canal: o.choix(CANAUX_PAR_TYPE[type]),
      description: o.choix(DESCRIPTIONS[type])
    });
  }
  lignes.sort((a, b) => a.date_transaction.localeCompare(b.date_transaction));
  lignes.forEach((l, i) => { l.reference = `TXN-${pad(i + 1, 6)}`; });
  return lignes;
}

// ---------------------------------------------------------------- anomalies contrôlées
// [code anomalie, nombre de lignes touchées, motif attendu en sortie de KNIME, transformation]
// motif 'OK' = anomalie CORRIGEABLE : la ligne doit être normalisée puis acceptée.
const CATALOGUE = [
  ['REFERENCE_VIDE', 4, 'REFERENCE_MANQUANTE', (l) => { l.reference = ''; }],
  ['REFERENCE_MAL_FORMEE', 3, 'REFERENCE_INVALIDE', (l) => { l.reference = l.reference.replace('TXN-', 'TX'); }],
  ['COMPTE_SOURCE_VIDE', 4, 'COMPTE_SOURCE_MANQUANT', (l) => { l.compte_source = ''; }],
  ['COMPTE_SOURCE_MAL_FORME', 3, 'COMPTE_SOURCE_INVALIDE', (l) => { l.compte_source = l.compte_source.slice(0, 7) + 'AB'; }],
  ['TYPE_INCONNU', 4, 'TYPE_INVALIDE', (l) => { l.type = 'TRANSFERT'; }],
  ['MONTANT_VIDE', 3, 'MONTANT_MANQUANT', (l) => { l.montant = ''; }],
  ['MONTANT_NEGATIF', 5, 'MONTANT_NEGATIF', (l) => { l.montant = `-${l.montant}`; }],
  ['MONTANT_TEXTE', 3, 'MONTANT_NON_NUMERIQUE', (l, i) => { l.montant = ['mille', '12a00', 'N/A'][i % 3]; }],
  ['MONTANT_ZERO', 3, 'MONTANT_NUL', (l) => { l.montant = '0.00'; }],
  ['DEVISE_INCONNUE', 3, 'DEVISE_INVALIDE', (l, i) => { l.devise = ['FCFA', 'XXX', 'EURO'][i % 3]; }],
  ['DATE_VIDE', 3, 'DATE_MANQUANTE', (l) => { l.date_transaction = ''; }],
  ['DATE_IMPOSSIBLE', 4, 'DATE_INVALIDE', (l, i) => {
    l.date_transaction = ['2026-13-05T10:00:00', 'hier', '2026/03/04 08:15:00', '2026-04-32T09:00:00'][i % 4];
  }],
  ['STATUT_INCONNU', 3, 'STATUT_INVALIDE', (l) => { l.statut = 'OK'; }],
  ['CANAL_INCONNU', 2, 'CANAL_INVALIDE', (l) => { l.canal = 'FAX'; }],
  ['VIREMENT_SANS_DESTINATION', 3, 'DESTINATION_MANQUANTE', (l) => { l.type = 'VIREMENT'; l.compte_destination = ''; }],
  ['DESTINATION_MAL_FORMEE', 2, 'DESTINATION_INVALIDE', (l) => { l.compte_destination = 'CPT99'; }],
  ['VIREMENT_VERS_SOI', 2, 'COMPTES_IDENTIQUES', (l) => { l.type = 'VIREMENT'; l.compte_destination = l.compte_source; }],
  // --- anomalies corrigeables (la ligne reste valide après normalisation)
  ['TYPE_MINUSCULES_ESPACES', 6, 'OK', (l) => { l.type = ` ${l.type.toLowerCase()} `; }],
  ['MONTANT_VIRGULE_DECIMALE', 5, 'OK', (l) => { l.montant = l.montant.replace('.', ','); }],
  ['MONTANT_SEPARATEUR_MILLIERS', 3, 'OK', (l) => {
    const [ent, dec] = l.montant.split('.');
    l.montant = `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${dec}`;
  }],
  ['DATE_FORMAT_FRANCAIS', 5, 'OK', (l) => {
    const [, a, m, j, h] = l.date_transaction.match(/^(\d{4})-(\d{2})-(\d{2})T(.*)$/);
    l.date_transaction = `${j}/${m}/${a} ${h}`;
  }],
  ['COMPTE_MINUSCULES', 4, 'OK', (l) => { l.compte_source = ` ${l.compte_source.toLowerCase()}`; }],
  ['STATUT_CANAL_MINUSCULES', 3, 'OK', (l) => { l.statut = l.statut.toLowerCase(); l.canal = l.canal.toLowerCase(); }]
];
const NB_DOUBLONS_EXACTS = 8;
const NB_DOUBLONS_VARIANTES = 2;

function injecterAnomalies(lignes, o) {
  const indicesLibres = lignes.map((_, i) => i);
  const tirer = () => indicesLibres.splice(o.entier(0, indicesLibres.length - 1), 1)[0];
  const anomalies = new Map(); // index -> {anomalie, motif}

  for (const [code, nombre, motif, transformer] of CATALOGUE) {
    for (let k = 0; k < nombre; k++) {
      const i = tirer();
      const ligne = lignes[i];
      if (code === 'MONTANT_SEPARATEUR_MILLIERS' && Number(ligne.montant) < 1000) ligne.montant = '125000.00';
      transformer(ligne, k);
      anomalies.set(ligne, { anomalie: code, motif_attendu: motif, reference_originale: `TXN-${pad(i + 1, 6)}` });
    }
  }

  // Doublons : copies de lignes saines insérées plus loin dans le fichier
  const resultat = [...lignes];
  const ajouterDoublon = (variante) => {
    const i = tirer();
    const copie = { ...lignes[i] };
    if (variante) copie.type = copie.type.toLowerCase();
    // la copie est toujours insérée APRÈS l'original : l'original reste la 1re occurrence
    const position = o.entier(resultat.indexOf(lignes[i]) + 1, resultat.length);
    resultat.splice(position, 0, copie);
    anomalies.set(copie, {
      anomalie: variante ? 'DOUBLON_AVEC_VARIANTE' : 'DOUBLON_EXACT',
      motif_attendu: 'DOUBLON_REFERENCE',
      reference_originale: copie.reference
    });
  };
  for (let k = 0; k < NB_DOUBLONS_EXACTS; k++) ajouterDoublon(false);
  for (let k = 0; k < NB_DOUBLONS_VARIANTES; k++) ajouterDoublon(true);

  const manifeste = [];
  resultat.forEach((ligne, idx) => {
    const a = anomalies.get(ligne);
    if (a) manifeste.push({ ligne: idx + 1, ...a });
  });
  return { lignes: resultat, manifeste };
}

// ---------------------------------------------------------------- programme principal
function generer({ nombre, graine }) {
  const o = creerOutils(mulberry32(graine));
  const valides = genererTransactionsValides(nombre, o);
  return injecterAnomalies(valides, o);
}

if (require.main === module) {
  const args = lireArguments(process.argv.slice(2));
  const { lignes, manifeste } = generer(args);
  fs.mkdirSync(args.sortie, { recursive: true });
  const csv = path.join(args.sortie, 'transactions_brutes.csv');
  const json = path.join(args.sortie, 'anomalies_injectees.json');
  ecrireCsv(csv, COLONNES_BRUTES, lignes);
  const resume = {
    graine: args.graine,
    lignes_totales: lignes.length,
    transactions_de_base: args.nombre,
    anomalies_rejetees_attendues: manifeste.filter((m) => m.motif_attendu !== 'OK').length,
    anomalies_corrigeables: manifeste.filter((m) => m.motif_attendu === 'OK').length,
    detail: manifeste
  };
  fs.writeFileSync(json, JSON.stringify(resume, null, 2) + '\n', 'utf8');
  console.log(`[generateur] ${lignes.length} lignes écrites dans ${csv}`);
  console.log(`[generateur] ${resume.anomalies_rejetees_attendues} rejets attendus, ${resume.anomalies_corrigeables} anomalies corrigeables`);
  console.log(`[generateur] manifeste : ${json}`);
}

module.exports = { generer, mulberry32, CATALOGUE };
