'use strict';
const { preparer } = require('../../src/scripts/load-csv');
const { parseCsv } = require('../../src/utils/csv');

const ligneKnime = (modif = {}) => ({
  reference: 'TXN-000001', compte_source: 'CPT10000001', compte_destination: '', type: 'DEPOT',
  montant: '50000.0', devise: 'XOF', date_transaction: '2026-01-05T09:00:00', statut: 'EFFECTUEE',
  canal: 'GUICHET', description: 'Depot especes', categorie_montant: 'FAIBLE', ...modif
});

describe('préparation du chargement KNIME -> PostgreSQL', () => {
  test('convertit les types (montant KNIME "50000.0", destination vide -> null)', () => {
    const { aInserer, rejetsChargement } = preparer([ligneKnime()], []);
    expect(rejetsChargement).toHaveLength(0);
    expect(aInserer[0]).toMatchObject({ montant: 50000, compte_destination: null, categorie_montant: 'FAIBLE' });
  });

  test('revalide : une ligne invalide sortie de KNIME est rejetée avec REJET_CHARGEMENT', () => {
    const { aInserer, rejets } = preparer([ligneKnime({ montant: '-1' })], [{ reference: 'X', motif_rejet: 'TYPE_INVALIDE' }]);
    expect(aInserer).toHaveLength(0);
    expect(rejets.map((r) => r.motif_rejet)).toEqual(['TYPE_INVALIDE', 'REJET_CHARGEMENT:montant']);
  });

  test('doublon de référence dans le fichier : la première ligne est gardée', () => {
    const { aInserer, rejetsChargement } = preparer([ligneKnime(), ligneKnime({ montant: '999.0' })], []);
    expect(aInserer).toHaveLength(1);
    expect(aInserer[0].montant).toBe(50000);
    expect(rejetsChargement[0].motif_rejet).toBe('REJET_CHARGEMENT:doublon');
  });

  test('catégorie KNIME incohérente : recalculée et signalée', () => {
    const { aInserer, ecartsCategorie } = preparer([ligneKnime({ categorie_montant: 'ELEVE' })], []);
    expect(aInserer[0].categorie_montant).toBe('FAIBLE');
    expect(ecartsCategorie).toEqual(['TXN-000001']);
  });

  test('lecture CSV avec BOM et guillemets (export KNIME/Excel)', () => {
    expect(parseCsv('﻿a,b\n"x,y",2\n')).toEqual([['a', 'b'], ['x,y', '2']]);
  });
});
