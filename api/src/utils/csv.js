'use strict';
/**
 * Lecture CSV minimale (RFC 4180), identique à data/scripts/csv.js.
 * Copiée ici car l'image Docker de l'API ne contient que le dossier api/.
 */
const fs = require('node:fs');

function parseCsv(texte) {
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;
  const t = texte.replace(/^﻿/, '');

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++; } else { entreGuillemets = false; }
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === ',') {
      ligne.push(champ); champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      lignes.push(ligne); ligne = [];
    } else {
      champ += c;
    }
  }
  if (champ !== '' || ligne.length > 0) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter((l) => !(l.length === 1 && l[0] === ''));
}

function lireCsv(chemin) {
  const [entete, ...donnees] = parseCsv(fs.readFileSync(chemin, 'utf8'));
  if (!entete) return [];
  const colonnes = entete.map((c) => c.trim());
  return donnees.map((valeurs) => Object.fromEntries(colonnes.map((c, i) => [c, valeurs[i] ?? ''])));
}

module.exports = { parseCsv, lireCsv };
