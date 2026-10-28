#!/usr/bin/env node
'use strict';
/**
 * Compare la sortie du workflow KNIME (data/processed/) avec le résultat attendu
 * (data/expected/, produit par reference-etl.js).
 *
 * Code de sortie 0 = sortie KNIME conforme, 1 = écarts détectés (détail affiché).
 *
 * Usage : node data/scripts/compare-outputs.js [--knime data/processed] [--attendu data/expected]
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireCsv } = require('./csv');
const { COLONNES_VALIDES, COLONNES_REJETEES } = require('./rules');

function lireArguments(argv) {
  const args = {
    knime: path.join(__dirname, '..', 'processed'),
    attendu: path.join(__dirname, '..', 'expected')
  };
  for (let i = 0; i < argv.length; i += 2) {
    const cle = argv[i].replace(/^--/, '');
    if (!(cle in args)) throw new Error(`Argument inconnu : ${argv[i]}`);
    args[cle] = path.resolve(argv[i + 1]);
  }
  return args;
}

const vide = (v) => v === undefined || v === null || v === '';

/** Deux valeurs sont égales si elles sont toutes deux vides, numériquement égales (montant) ou textuellement égales. */
function egales(colonne, a, b) {
  if (vide(a) && vide(b)) return true;
  if (colonne === 'montant') return Math.abs(Number(a) - Number(b)) < 0.005;
  return String(a).trim() === String(b).trim();
}

function comparer(dossierKnime, dossierAttendu) {
  const ecarts = [];
  const fichiers = ['transactions_valides.csv', 'transactions_rejetees.csv'];
  for (const f of fichiers) {
    if (!fs.existsSync(path.join(dossierKnime, f))) ecarts.push(`Fichier absent dans la sortie KNIME : ${f}`);
  }
  if (ecarts.length) return { ecarts };

  const kValides = lireCsv(path.join(dossierKnime, 'transactions_valides.csv'));
  const aValides = lireCsv(path.join(dossierAttendu, 'transactions_valides.csv'));
  const kRejets = lireCsv(path.join(dossierKnime, 'transactions_rejetees.csv'));
  const aRejets = lireCsv(path.join(dossierAttendu, 'transactions_rejetees.csv'));

  // 1. colonnes
  const verifierColonnes = (lignes, attendues, nom) => {
    if (!lignes.length) return;
    const manquantes = attendues.filter((c) => !(c in lignes[0]));
    if (manquantes.length) ecarts.push(`${nom} : colonnes manquantes ${manquantes.join(', ')}`);
  };
  verifierColonnes(kValides, COLONNES_VALIDES, 'transactions_valides.csv');
  verifierColonnes(kRejets, COLONNES_REJETEES, 'transactions_rejetees.csv');

  // 2. volumes
  if (kValides.length !== aValides.length) ecarts.push(`Valides : ${kValides.length} (KNIME) au lieu de ${aValides.length}`);
  if (kRejets.length !== aRejets.length) ecarts.push(`Rejetées : ${kRejets.length} (KNIME) au lieu de ${aRejets.length}`);

  // 3. contenu des valides, ligne par ligne via la référence
  const index = new Map(kValides.map((l) => [l.reference, l]));
  for (const attendu of aValides) {
    const obtenu = index.get(attendu.reference);
    if (!obtenu) { ecarts.push(`Valide manquante dans KNIME : ${attendu.reference}`); continue; }
    for (const c of COLONNES_VALIDES) {
      if (!egales(c, obtenu[c], attendu[c])) {
        ecarts.push(`${attendu.reference}.${c} : "${obtenu[c]}" (KNIME) au lieu de "${attendu[c]}"`);
      }
    }
  }

  // 4. motifs de rejet (comparaison des effectifs par motif)
  const parMotif = (lignes) => lignes.reduce((acc, l) => ({ ...acc, [l.motif_rejet]: (acc[l.motif_rejet] || 0) + 1 }), {});
  const kM = parMotif(kRejets);
  const aM = parMotif(aRejets);
  for (const m of new Set([...Object.keys(kM), ...Object.keys(aM)])) {
    if ((kM[m] || 0) !== (aM[m] || 0)) ecarts.push(`Motif ${m} : ${kM[m] || 0} (KNIME) au lieu de ${aM[m] || 0}`);
  }
  return { ecarts, kValides: kValides.length, kRejets: kRejets.length, motifs: kM };
}

if (require.main === module) {
  const { knime, attendu } = lireArguments(process.argv.slice(2));
  const r = comparer(knime, attendu);
  if (r.ecarts.length === 0) {
    console.log(`[comparaison] CONFORME : ${r.kValides} valides, ${r.kRejets} rejetées, motifs identiques au résultat attendu.`);
    process.exit(0);
  }
  console.error(`[comparaison] ${r.ecarts.length} écart(s) détecté(s) :`);
  r.ecarts.slice(0, 50).forEach((e) => console.error(`  - ${e}`));
  if (r.ecarts.length > 50) console.error(`  ... (${r.ecarts.length - 50} autres)`);
  process.exit(1);
}

module.exports = { comparer };
