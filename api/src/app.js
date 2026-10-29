'use strict';
/**
 * Construction de l'application Express. Le dépôt de données est injecté :
 * PostgreSQL en production, dépôt en mémoire dans les tests.
 */
const path = require('node:path');
const express = require('express');
const { creerMetriques } = require('./metrics/metrics');
const { routesTransactions } = require('./routes/transactions');
const { routesRejets, routesChargements } = require('./routes/rejets');
const { gestionnaireErreurs, routeIntrouvable } = require('./middleware/errorHandler');

const OPENAPI = path.join(__dirname, '..', 'openapi.yaml');

function journal(req, res, next) {
  const debut = Date.now();
  res.on('finish', () => console.log(`[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - debut} ms)`));
  next();
}

function creerApp({ depot, journaliser = false, metriques = creerMetriques() }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  app.use(metriques.middleware);
  if (journaliser) app.use(journal);
  app.use(express.json({ limit: '100kb' }));

  const m = metriques.marquerRoute;
  app.get('/', m, (req, res) => res.json({
    service: 'API REST de transactions - Groupe 5 - Thème 6',
    liens: {
      transactions: '/api/transactions',
      statistiques: '/api/transactions/statistiques',
      rejets: '/api/rejets',
      dernier_chargement: '/api/chargements/dernier',
      sante: '/health',
      disponibilite: '/health/ready',
      metriques: '/metrics',
      contrat_openapi: '/openapi.yaml'
    }
  }));

  // vivacité : le processus répond
  app.get('/health', m, (req, res) => res.json({ statut: 'ok' }));
  // disponibilité : la base répond aussi
  app.get('/health/ready', m, async (req, res) => {
    try {
      await depot.ping();
      res.json({ statut: 'ok', base: 'ok' });
    } catch (e) {
      // ECONNREFUSED sur IPv4 + IPv6 donne une AggregateError au message vide : on renvoie alors le code
      res.status(503).json({ statut: 'degrade', base: 'indisponible', detail: e.message || e.code || 'erreur inconnue' });
    }
  });
  app.get('/metrics', metriques.exposer);
  app.get('/openapi.yaml', m, (req, res) => res.type('application/yaml').sendFile(OPENAPI));

  app.use('/api/transactions', routesTransactions({ depot, metriques }));
  app.use('/api/rejets', routesRejets({ depot, metriques }));
  app.use('/api/chargements', routesChargements({ depot, metriques }));

  app.use(routeIntrouvable);
  app.use(gestionnaireErreurs);
  return app;
}

module.exports = { creerApp };
