'use strict';
const { validerCreation, validerModification } = require('../../src/validation/transaction');
const { lireRequeteTransactions, lireRequeteRejets, lireReference } = require('../../src/validation/query');
const { estDateHeureValide, categorieMontant } = require('../../src/domain/rules');
const { nouvelle, transactions } = require('../helpers/fixtures');

const details = (fn) => {
  try { fn(); } catch (e) { return e.details.map((d) => d.champ); }
  throw new Error('aucune erreur levée');
};

describe('validerCreation', () => {
  test('accepte une transaction valide et calcule la catégorie', () => {
    const t = validerCreation(nouvelle());
    expect(t.categorie_montant).toBe('MOYEN');
    expect(t.reference).toBe('TXN-900001');
  });

  test('normalise comme KNIME (espaces, majuscules) et applique les valeurs par défaut', () => {
    const { devise, statut, ...reste } = nouvelle();
    const t = validerCreation({ ...reste, type: ' virement ', canal: 'mobile', compte_source: 'cpt10000010' });
    expect(t).toMatchObject({ type: 'VIREMENT', canal: 'MOBILE', compte_source: 'CPT10000010', devise: 'XOF', statut: 'EN_ATTENTE' });
  });

  test('signale tous les champs obligatoires manquants en une fois', () => {
    expect(details(() => validerCreation({}))).toEqual(
      expect.arrayContaining(['reference', 'compte_source', 'type', 'montant', 'date_transaction', 'canal'])
    );
  });

  test.each([
    [{ reference: 'TX-1' }, 'reference'],
    [{ compte_source: 'CPT1' }, 'compte_source'],
    [{ type: 'TRANSFERT' }, 'type'],
    [{ montant: -10 }, 'montant'],
    [{ montant: 0 }, 'montant'],
    [{ montant: '1000' }, 'montant'],
    [{ montant: 10.555 }, 'montant'],
    [{ devise: 'FCFA' }, 'devise'],
    [{ date_transaction: '2026-02-30T10:00:00' }, 'date_transaction'],
    [{ date_transaction: '28/10/2026 10:00:00' }, 'date_transaction'],
    [{ statut: 'OK' }, 'statut'],
    [{ canal: 'FAX' }, 'canal'],
    [{ compte_destination: null }, 'compte_destination'],
    [{ compte_destination: 'CPT10000010' }, 'compte_destination'],
    [{ description: 'x'.repeat(256) }, 'description'],
    [{ champ_inconnu: 1 }, 'champ_inconnu']
  ])('refuse %j', (modif, champ) => {
    expect(details(() => validerCreation({ ...nouvelle(), ...modif }))).toContain(champ);
  });

  test('un DEPOT sans compte destination est accepté', () => {
    expect(validerCreation({ ...nouvelle(), type: 'DEPOT', compte_destination: null }).compte_destination).toBeNull();
  });

  test('refuse un corps qui n\'est pas un objet', () => {
    expect(details(() => validerCreation(undefined))).toEqual(['corps']);
    expect(details(() => validerCreation([1, 2]))).toEqual(['corps']);
  });
});

describe('validerModification', () => {
  const existante = transactions[1]; // VIREMENT

  test('fusionne puis revalide l\'ensemble', () => {
    const t = validerModification(existante, { statut: 'annulee', montant: 2000000 });
    expect(t).toMatchObject({ statut: 'ANNULEE', montant: 2000000, categorie_montant: 'ELEVE', type: 'VIREMENT' });
  });

  test('refuse la modification de la référence ou d\'un champ calculé', () => {
    expect(details(() => validerModification(existante, { reference: 'TXN-000777' }))).toEqual(['reference']);
    expect(details(() => validerModification(existante, { categorie_montant: 'ELEVE' }))).toEqual(['categorie_montant']);
  });

  test('refuse un corps vide', () => {
    expect(details(() => validerModification(existante, {}))).toEqual(['corps']);
  });

  test('détecte une incohérence créée par la modification (virement sans destination)', () => {
    expect(details(() => validerModification(existante, { compte_destination: null }))).toContain('compte_destination');
  });
});

describe('lireRequeteTransactions', () => {
  test('valeurs par défaut', () => {
    expect(lireRequeteTransactions({})).toEqual({ filtres: {}, page: 1, limite: 20, tri: 'date_transaction', ordre: 'desc' });
  });

  test('filtres multiples et dates', () => {
    const r = lireRequeteTransactions({
      type: 'depot,retrait', date_debut: '2026-01-01', date_fin: '2026-01-31', montant_min: '1000', compte: 'cpt10000001', page: '2', limite: '50', tri: 'montant', ordre: 'ASC'
    });
    expect(r.filtres).toEqual({
      type: ['DEPOT', 'RETRAIT'], date_debut: '2026-01-01T00:00:00', date_fin: '2026-01-31T23:59:59', montant_min: 1000, compte: 'CPT10000001'
    });
    expect(r).toMatchObject({ page: 2, limite: 50, tri: 'montant', ordre: 'asc' });
  });

  test.each([
    [{ tpye: 'DEPOT' }, 'tpye'],
    [{ type: 'TRANSFERT' }, 'type'],
    [{ page: '0' }, 'page'],
    [{ limite: '500' }, 'limite'],
    [{ limite: 'abc' }, 'limite'],
    [{ montant_min: '-1' }, 'montant_min'],
    [{ montant_min: '500', montant_max: '100' }, 'montant_max'],
    [{ date_debut: '2026-13-01' }, 'date_debut'],
    [{ date_debut: '2026-05-01', date_fin: '2026-04-01' }, 'date_fin'],
    [{ tri: 'statut' }, 'tri'],
    [{ ordre: 'haut' }, 'ordre'],
    [{ compte: 'X' }, 'compte']
  ])('refuse %j', (q, champ) => {
    expect(details(() => lireRequeteTransactions(q))).toContain(champ);
  });
});

describe('divers', () => {
  test('lireRequeteRejets et lireReference', () => {
    expect(lireRequeteRejets({ motif: 'montant_negatif' }).filtres).toEqual({ motif: 'MONTANT_NEGATIF' });
    expect(details(() => lireRequeteRejets({ x: '1' }))).toEqual(['x']);
    expect(lireReference('txn-000001')).toBe('TXN-000001');
    expect(details(() => lireReference('abc'))).toEqual(['reference']);
  });

  test('dates réelles uniquement', () => {
    expect(estDateHeureValide('2026-02-28T23:59:59')).toBe(true);
    expect(estDateHeureValide('2026-02-29T00:00:00')).toBe(false); // 2026 n'est pas bissextile
    expect(estDateHeureValide('2026-01-01T24:00:00')).toBe(false);
  });

  test('catégories de montant', () => {
    expect([99999.99, 100000, 999999.99, 1000000].map(categorieMontant)).toEqual(['FAIBLE', 'MOYEN', 'MOYEN', 'ELEVE']);
  });
});
