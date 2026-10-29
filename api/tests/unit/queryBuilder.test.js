'use strict';
const { construireWhere, construireTri, construireRecherche } = require('../../src/repositories/queryBuilder');

describe('construction SQL', () => {
  test('sans filtre : pas de WHERE', () => {
    expect(construireWhere({})).toEqual({ where: '', params: [] });
  });

  test('tous les filtres sont paramétrés ($n), jamais concaténés', () => {
    const { where, params } = construireWhere({
      type: ['DEPOT'], compte: 'CPT10000001', date_debut: '2026-01-01T00:00:00', montant_min: 10, montant_max: 20
    });
    expect(where).toBe(
      'WHERE type = ANY($1::text[]) AND (compte_source = $2 OR compte_destination = $2) ' +
      'AND date_transaction >= $3::timestamp AND montant >= $4 AND montant <= $5'
    );
    expect(params).toEqual([['DEPOT'], 'CPT10000001', '2026-01-01T00:00:00', 10, 20]);
  });

  test('une tentative d\'injection reste une simple valeur de paramètre', () => {
    const { where, params } = construireWhere({ compte_source: "x' OR 1=1 --" });
    expect(where).toBe('WHERE compte_source = $1');
    expect(params).toEqual(["x' OR 1=1 --"]);
  });

  test('tri : liste blanche + départage stable par référence', () => {
    expect(construireTri('montant', 'asc')).toBe('ORDER BY montant ASC, reference ASC');
    expect(construireTri('reference', 'desc')).toBe('ORDER BY reference DESC');
    expect(() => construireTri('1; DROP TABLE transactions')).toThrow();
  });

  test('pagination : LIMIT / OFFSET après les filtres', () => {
    const r = construireRecherche({ filtres: { statut: ['EFFECTUEE'] }, page: 3, limite: 20, tri: 'date_transaction', ordre: 'desc' }, '*');
    expect(r.sql).toMatch(/LIMIT \$2 OFFSET \$3$/);
    expect(r.params).toEqual([['EFFECTUEE'], 20, 40]);
    expect(r.paramsCompte).toEqual([['EFFECTUEE']]);
  });
});
