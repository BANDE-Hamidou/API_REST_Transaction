'use strict';
// Tests de la chaîne de données : générateur, règles de contrôle (miroir KNIME), CSV.
// Lancement : npm run test:data   (depuis la racine du projet)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { generer } = require('../scripts/generate-transactions');
const { normaliser, motifRejet, traiterLot, categorieMontant } = require('../scripts/rules');
const { parseCsv, ecrireCsv, lireCsv } = require('../scripts/csv');
const { comparer } = require('../scripts/compare-outputs');

const ligneValide = () => ({
  reference: 'TXN-000001', compte_source: 'CPT10000001', compte_destination: 'CPT10000002',
  type: 'VIREMENT', montant: '15000.00', devise: 'XOF', date_transaction: '2026-03-14T10:22:05',
  statut: 'EFFECTUEE', canal: 'MOBILE', description: 'Virement loyer'
});

test('le générateur est déterministe (même graine = mêmes données)', () => {
  const a = generer({ nombre: 300, graine: 7 });
  const b = generer({ nombre: 300, graine: 7 });
  assert.deepEqual(a.lignes, b.lignes);
  const c = generer({ nombre: 300, graine: 8 });
  assert.notDeepEqual(a.lignes, c.lignes);
});

test('chaque anomalie injectée produit exactement le motif attendu', () => {
  const { lignes, manifeste } = generer({ nombre: 1000, graine: 2026 });
  const resultats = [];
  const vues = new Set();
  for (const brute of lignes) {
    const n = normaliser(brute);
    let m = motifRejet(n);
    if (m === 'OK') { if (vues.has(n.reference)) m = 'DOUBLON_REFERENCE'; else vues.add(n.reference); }
    resultats.push(m);
  }
  for (const a of manifeste) {
    assert.equal(resultats[a.ligne - 1], a.motif_attendu, `ligne ${a.ligne} (${a.anomalie})`);
  }
  // les lignes sans anomalie doivent toutes être valides
  const lignesAnomalie = new Set(manifeste.map((a) => a.ligne));
  resultats.forEach((m, i) => { if (!lignesAnomalie.has(i + 1)) assert.equal(m, 'OK', `ligne saine ${i + 1}`); });
});

test('les règles de contrôle détectent chaque cas', () => {
  const cas = [
    [{ reference: '' }, 'REFERENCE_MANQUANTE'],
    [{ reference: 'TX000001' }, 'REFERENCE_INVALIDE'],
    [{ compte_source: '' }, 'COMPTE_SOURCE_MANQUANT'],
    [{ compte_source: 'CPT1234' }, 'COMPTE_SOURCE_INVALIDE'],
    [{ type: 'TRANSFERT' }, 'TYPE_INVALIDE'],
    [{ montant: '' }, 'MONTANT_MANQUANT'],
    [{ montant: '-10.00' }, 'MONTANT_NEGATIF'],
    [{ montant: '12a00' }, 'MONTANT_NON_NUMERIQUE'],
    [{ montant: '0.00' }, 'MONTANT_NUL'],
    [{ devise: 'FCFA' }, 'DEVISE_INVALIDE'],
    [{ date_transaction: '' }, 'DATE_MANQUANTE'],
    [{ date_transaction: '2026-13-01T00:00:00' }, 'DATE_INVALIDE'],
    [{ statut: 'OK' }, 'STATUT_INVALIDE'],
    [{ canal: 'FAX' }, 'CANAL_INVALIDE'],
    [{ compte_destination: '' }, 'DESTINATION_MANQUANTE'],
    [{ compte_destination: 'CPT99' }, 'DESTINATION_INVALIDE'],
    [{ compte_destination: 'CPT10000001' }, 'COMPTES_IDENTIQUES']
  ];
  assert.equal(motifRejet(normaliser(ligneValide())), 'OK');
  for (const [modif, motif] of cas) {
    assert.equal(motifRejet(normaliser({ ...ligneValide(), ...modif })), motif, JSON.stringify(modif));
  }
});

test('la normalisation corrige les anomalies récupérables', () => {
  const n = normaliser({
    ...ligneValide(), type: ' virement ', montant: '1 250 000,50', compte_source: ' cpt10000001',
    date_transaction: '14/03/2026 10:22:05', statut: 'effectuee', canal: 'mobile'
  });
  assert.equal(n.type, 'VIREMENT');
  assert.equal(n.montant, '1250000.50');
  assert.equal(n.compte_source, 'CPT10000001');
  assert.equal(n.date_transaction, '2026-03-14T10:22:05');
  assert.equal(motifRejet(n), 'OK');
});

test('un dépôt sans compte destination est valide, un virement non', () => {
  assert.equal(motifRejet(normaliser({ ...ligneValide(), type: 'DEPOT', compte_destination: '' })), 'OK');
  assert.equal(motifRejet(normaliser({ ...ligneValide(), type: 'VIREMENT', compte_destination: '' })), 'DESTINATION_MANQUANTE');
});

test('catégorie de montant : seuils 100 000 et 1 000 000', () => {
  assert.equal(categorieMontant('99999.99'), 'FAIBLE');
  assert.equal(categorieMontant('100000'), 'MOYEN');
  assert.equal(categorieMontant('999999.99'), 'MOYEN');
  assert.equal(categorieMontant('1000000'), 'ELEVE');
});

test('doublons : la première occurrence est gardée, la suivante rejetée', () => {
  const { valides, rejetees } = traiterLot([ligneValide(), ligneValide(), { ...ligneValide(), reference: 'TXN-000002' }]);
  assert.equal(valides.length, 2);
  assert.equal(rejetees.length, 1);
  assert.equal(rejetees[0].motif_rejet, 'DOUBLON_REFERENCE');
});

test('CSV : guillemets, virgules et lignes Windows', () => {
  const lignes = parseCsv('a,b,c\r\n1,"12500,50","dit ""bonjour"""\r\n2,,\r\n');
  assert.deepEqual(lignes, [['a', 'b', 'c'], ['1', '12500,50', 'dit "bonjour"'], ['2', '', '']]);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-'));
  const f = path.join(dossier, 't.csv');
  ecrireCsv(f, ['x', 'y'], [{ x: 'a,b', y: null }]);
  assert.deepEqual(lireCsv(f), [{ x: 'a,b', y: '' }]);
});

test('le comparateur détecte une sortie KNIME non conforme', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  const attendu = path.join(dossier, 'attendu');
  const knime = path.join(dossier, 'knime');
  fs.mkdirSync(attendu); fs.mkdirSync(knime);
  const { valides, rejetees } = traiterLot([ligneValide(), { ...ligneValide(), reference: '' }]);
  const { COLONNES_VALIDES, COLONNES_REJETEES } = require('../scripts/rules');
  for (const d of [attendu, knime]) {
    ecrireCsv(path.join(d, 'transactions_valides.csv'), COLONNES_VALIDES, valides);
    ecrireCsv(path.join(d, 'transactions_rejetees.csv'), COLONNES_REJETEES, rejetees);
  }
  assert.equal(comparer(knime, attendu).ecarts.length, 0);
  // KNIME écrit les nombres réels sous la forme 15000.0 : doit rester conforme
  ecrireCsv(path.join(knime, 'transactions_valides.csv'), COLONNES_VALIDES, valides.map((v) => ({ ...v, montant: '15000.0' })));
  assert.equal(comparer(knime, attendu).ecarts.length, 0);
  ecrireCsv(path.join(knime, 'transactions_valides.csv'), COLONNES_VALIDES, valides.map((v) => ({ ...v, type: 'DEPOT' })));
  assert.ok(comparer(knime, attendu).ecarts.some((e) => e.includes('.type')));
});
