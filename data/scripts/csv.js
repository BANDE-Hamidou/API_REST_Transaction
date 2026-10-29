'use strict';
/**
 * Lecture / écriture CSV minimale (RFC 4180) : séparateur virgule,
 * guillemets doubles pour les champs contenant , " ou un saut de ligne.
 * Aucune dépendance externe pour que les scripts de données tournent avec Node seul.
 */
const fs = require('node:fs');

function parseCsv(texte) {
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;
  const t = texte.replace(/^﻿/, ''); // BOM éventuel (Excel, KNIME)

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

/** Retourne un tableau d'objets {colonne: valeur}. Les champs vides valent ''. */
function lireCsv(chemin) {
  const [entete, ...donnees] = parseCsv(fs.readFileSync(chemin, 'utf8'));
  if (!entete) return [];
  const colonnes = entete.map((c) => c.trim());
  return donnees.map((valeurs) => Object.fromEntries(colonnes.map((c, i) => [c, valeurs[i] ?? ''])));
}

function echapper(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ecrireCsv(chemin, colonnes, lignes) {
  const contenu = [colonnes.join(','), ...lignes.map((l) => colonnes.map((c) => echapper(l[c])).join(','))].join('\n') + '\n';
  fs.writeFileSync(chemin, contenu, 'utf8');
}

module.exports = { parseCsv, lireCsv, ecrireCsv, echapper };
