'use strict';
/**
 * Tests de l'API REST via HTTP (Supertest), avec un dépôt en mémoire.
 * Vérifie : codes HTTP, format des réponses, filtres, pagination, erreurs, métriques.
 */
const request = require('supertest');
const { creerApp } = require('../../src/app');
const { creerDepotMemoire } = require('../helpers/memoryRepository');
const { transactions, rejets, nouvelle } = require('../helpers/fixtures');

let app;
let depot;
beforeEach(() => {
  depot = creerDepotMemoire({
    transactions: transactions.map((t) => ({ ...t })),
    rejets,
    chargement: { id: 1, lignes_valides_lues: 5, lignes_inserees: 5, lignes_rejetees: 3 }
  });
  app = creerApp({ depot });
});

describe('santé et documentation', () => {
  test('GET /health -> 200', async () => {
    await request(app).get('/health').expect(200, { statut: 'ok' });
  });

  test('GET /health/ready -> 200 si la base répond, 503 sinon', async () => {
    await request(app).get('/health/ready').expect(200);
    depot.simulerPanne();
    const r = await request(app).get('/health/ready').expect(503);
    expect(r.body.base).toBe('indisponible');
  });

  test('GET /openapi.yaml renvoie le contrat', async () => {
    const r = await request(app).get('/openapi.yaml').expect(200);
    expect(r.text).toMatch(/^openapi: 3/m);
  });

  test('route inconnue -> 404 ROUTE_INTROUVABLE', async () => {
    const r = await request(app).get('/api/inexistant').expect(404);
    expect(r.body.erreur.code).toBe('ROUTE_INTROUVABLE');
  });
});

describe('GET /api/transactions', () => {
  test('liste paginée avec métadonnées', async () => {
    const r = await request(app).get('/api/transactions?limite=2').expect(200);
    expect(r.body.donnees).toHaveLength(2);
    expect(r.body.pagination).toEqual({ page: 1, limite: 2, total: 5, total_pages: 3 });
    // tri par défaut : date décroissante
    expect(r.body.donnees[0].reference).toBe('TXN-000005');
  });

  test('page 3 contient le dernier élément', async () => {
    const r = await request(app).get('/api/transactions?limite=2&page=3').expect(200);
    expect(r.body.donnees.map((t) => t.reference)).toEqual(['TXN-000001']);
  });

  test('filtre par type (valeurs multiples)', async () => {
    const r = await request(app).get('/api/transactions?type=VIREMENT,DEPOT').expect(200);
    expect(r.body.donnees.every((t) => ['VIREMENT', 'DEPOT'].includes(t.type))).toBe(true);
    expect(r.body.pagination.total).toBe(3);
  });

  test('filtre par compte (source OU destination)', async () => {
    const r = await request(app).get('/api/transactions?compte=CPT10000001').expect(200);
    expect(r.body.donnees.map((t) => t.reference).sort()).toEqual(['TXN-000001', 'TXN-000002', 'TXN-000004']);
  });

  test('filtre par période et montant, tri croissant par montant', async () => {
    const r = await request(app)
      .get('/api/transactions?date_debut=2026-02-01&date_fin=2026-03-31&montant_min=100&tri=montant&ordre=asc')
      .expect(200);
    expect(r.body.donnees.map((t) => t.reference)).toEqual(['TXN-000004', 'TXN-000002', 'TXN-000003']);
  });

  test('filtre par statut et catégorie', async () => {
    const r = await request(app).get('/api/transactions?statut=effectuee&categorie=FAIBLE').expect(200);
    expect(r.body.donnees.map((t) => t.reference).sort()).toEqual(['TXN-000001', 'TXN-000005']);
  });

  test('paramètre invalide -> 400 avec le détail', async () => {
    const r = await request(app).get('/api/transactions?type=TRANSFERT&limite=1000').expect(400);
    expect(r.body.erreur.code).toBe('VALIDATION_ECHOUEE');
    expect(r.body.erreur.details.map((d) => d.champ).sort()).toEqual(['limite', 'type']);
  });

  test('base indisponible -> 503 BASE_INDISPONIBLE', async () => {
    depot.simulerPanne();
    const r = await request(app).get('/api/transactions').expect(503);
    expect(r.body.erreur.code).toBe('BASE_INDISPONIBLE');
  });
});

describe('GET /api/transactions/:reference et /statistiques', () => {
  test('détail -> 200', async () => {
    const r = await request(app).get('/api/transactions/TXN-000002').expect(200);
    expect(r.body).toMatchObject({ reference: 'TXN-000002', type: 'VIREMENT', montant: 250000 });
  });

  test('inexistante -> 404, mal formée -> 400', async () => {
    expect((await request(app).get('/api/transactions/TXN-777777').expect(404)).body.erreur.code).toBe('RESSOURCE_INTROUVABLE');
    await request(app).get('/api/transactions/abc').expect(400);
  });

  test('statistiques par type et devise, avec filtres', async () => {
    const r = await request(app).get('/api/transactions/statistiques?devise=XOF').expect(200);
    const virement = r.body.donnees.find((g) => g.type === 'VIREMENT');
    expect(virement).toMatchObject({ devise: 'XOF', nombre: 2, montant_total: 325000 });
  });
});

describe('écritures', () => {
  test('POST -> 201 + en-tête Location, puis visible en GET', async () => {
    const r = await request(app).post('/api/transactions').send(nouvelle()).expect(201);
    expect(r.headers.location).toBe('/api/transactions/TXN-900001');
    expect(r.body).toMatchObject({ reference: 'TXN-900001', source: 'API', categorie_montant: 'MOYEN' });
    await request(app).get('/api/transactions/TXN-900001').expect(200);
  });

  test('POST en double -> 409 CONFLIT', async () => {
    await request(app).post('/api/transactions').send(nouvelle()).expect(201);
    const r = await request(app).post('/api/transactions').send(nouvelle()).expect(409);
    expect(r.body.erreur.code).toBe('CONFLIT');
  });

  test('POST invalide -> 400 avec tous les champs en erreur', async () => {
    const r = await request(app).post('/api/transactions').send({ ...nouvelle(), montant: -5, type: 'X' }).expect(400);
    expect(r.body.erreur.details.map((d) => d.champ).sort()).toEqual(['montant', 'type']);
  });

  test('POST avec JSON mal formé -> 400 JSON_INVALIDE', async () => {
    const r = await request(app).post('/api/transactions').set('Content-Type', 'application/json').send('{"reference": ').expect(400);
    expect(r.body.erreur.code).toBe('JSON_INVALIDE');
  });

  test('POST sans Content-Type JSON -> 400', async () => {
    await request(app).post('/api/transactions').set('Content-Type', 'text/plain').send('bonjour').expect(400);
  });

  test('PATCH -> 200, catégorie recalculée', async () => {
    const r = await request(app).patch('/api/transactions/TXN-000001').send({ montant: 2500000, statut: 'ANNULEE' }).expect(200);
    expect(r.body).toMatchObject({ montant: 2500000, statut: 'ANNULEE', categorie_montant: 'ELEVE' });
  });

  test('PATCH de la référence -> 400, inexistante -> 404', async () => {
    await request(app).patch('/api/transactions/TXN-000001').send({ reference: 'TXN-000009' }).expect(400);
    await request(app).patch('/api/transactions/TXN-777777').send({ statut: 'ANNULEE' }).expect(404);
  });

  test('DELETE -> 204 puis 404', async () => {
    await request(app).delete('/api/transactions/TXN-000003').expect(204);
    await request(app).get('/api/transactions/TXN-000003').expect(404);
    await request(app).delete('/api/transactions/TXN-000003').expect(404);
  });
});

describe('rejets et chargements', () => {
  test('GET /api/rejets filtré par motif', async () => {
    const r = await request(app).get('/api/rejets?motif=MONTANT_NEGATIF').expect(200);
    expect(r.body.pagination.total).toBe(2);
  });

  test('GET /api/rejets/statistiques', async () => {
    const r = await request(app).get('/api/rejets/statistiques').expect(200);
    expect(r.body.total).toBe(3);
  });

  test('GET /api/chargements/dernier : 200, ou 404 si aucun chargement', async () => {
    await request(app).get('/api/chargements/dernier').expect(200);
    const vide = creerApp({ depot: creerDepotMemoire() });
    await request(vide).get('/api/chargements/dernier').expect(404);
  });
});

describe('métriques Prometheus', () => {
  test('/metrics expose requêtes, erreurs et latence avec le modèle de route', async () => {
    await request(app).get('/api/transactions/TXN-000001').expect(200);
    await request(app).get('/api/transactions/TXN-777777').expect(404);
    await request(app).post('/api/transactions').send(nouvelle()).expect(201);
    depot.simulerPanne();
    await request(app).get('/api/transactions').expect(503);

    const r = await request(app).get('/metrics').expect(200);
    expect(r.headers['content-type']).toMatch(/text\/plain/);
    const m = r.text;
    expect(m).toMatch(/http_requests_total\{method="GET",route="\/api\/transactions\/:reference",status_code="200",service="api-transactions"\} 1/);
    expect(m).toMatch(/http_request_errors_total\{method="GET",route="\/api\/transactions\/:reference",status_code="404",error_type="client",service="api-transactions"\} 1/);
    expect(m).toMatch(/http_request_errors_total\{method="GET",route="\/api\/transactions",status_code="503",error_type="serveur",service="api-transactions"\} 1/);
    expect(m).toMatch(/http_request_duration_seconds_bucket\{le="0\.005",service="api-transactions",method="POST",route="\/api\/transactions",status_code="201"\}/);
    expect(m).toMatch(/http_request_duration_seconds_count\{service="api-transactions",method="POST",route="\/api\/transactions",status_code="201"\} 1/);
    expect(m).toMatch(/transactions_operations_total\{operation="creation",service="api-transactions"\} 1/);
    expect(m).toMatch(/process_cpu_seconds_total/);
    // les URL réelles ne deviennent pas des labels
    expect(m).not.toMatch(/TXN-000001/);
  });

  test('les appels à /metrics ne sont pas comptés', async () => {
    await request(app).get('/metrics');
    const r = await request(app).get('/metrics');
    expect(r.text).not.toMatch(/route="\/metrics"/);
  });
});
