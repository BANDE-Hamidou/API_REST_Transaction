#!/usr/bin/env node
'use strict';
/**
 * ETL de RÉFÉRENCE : applique en JavaScript exactement les mêmes règles que le
 * workflow KNIME, afin de connaître le résultat attendu.
 *
 * Ce script ne remplace PAS KNIME (qui reste l'outil ETL exigé par le sujet).
 * Il sert d'oracle de test : la sortie de KNIME (data/processed/) doit être
 * identique à data/expected/ (vérifié par compare-outputs.js).
 *
 * Usage : node data/scripts/reference-etl.js [--entree data/raw/transactions_brutes.csv] [--sortie data/expected]
 */
const fs = require('node:fs');
const path = require('node:path');
const { traiterLot, COLONNES_VALIDES, COLONNES_REJETEES } = require('./rules');
const { lireCsv, ecrireCsv } = require('./csv');

function lireArguments(argv) {
  const args = {
    entree: path.join(__dirname, '..', 'raw', 'transactions_brutes.csv'),
    sortie: path.join(__dirname, '..', 'expected')
  };
  for (let i = 0; i < argv.length; i += 2) {
    const cle = argv[i].replace(/^--/, '');
    if (!(cle in args)) throw new Error(`Argument inconnu : ${argv[i]}`);
    args[cle] = path.resolve(argv[i + 1]);
  }
  return args;
}

function compterParMotif(rejetees) {
  const compte = {};
  for (const r of rejetees) compte[r.motif_rejet] = (compte[r.motif_rejet] || 0) + 1;
  return Object.fromEntries(Object.entries(compte).sort(([a], [b]) => a.localeCompare(b)));
}

if (require.main === module) {
  const { entree, sortie } = lireArguments(process.argv.slice(2));
  const brutes = lireCsv(entree);
  const { valides, rejetees } = traiterLot(brutes);
  fs.mkdirSync(sortie, { recursive: true });
  ecrireCsv(path.join(sortie, 'transactions_valides.csv'), COLONNES_VALIDES, valides);
  ecrireCsv(path.join(sortie, 'transactions_rejetees.csv'), COLONNES_REJETEES, rejetees);
  const resume = {
    fichier_source: path.basename(entree),
    lignes_lues: brutes.length,
    lignes_valides: valides.length,
    lignes_rejetees: rejetees.length,
    rejets_par_motif: compterParMotif(rejetees)
  };
  fs.writeFileSync(path.join(sortie, 'resume.json'), JSON.stringify(resume, null, 2) + '\n', 'utf8');
  console.log(`[etl-reference] ${brutes.length} lues -> ${valides.length} valides, ${rejetees.length} rejetées`);
  console.log(`[etl-reference] résultats dans ${sortie}`);
}

module.exports = { compterParMotif };
