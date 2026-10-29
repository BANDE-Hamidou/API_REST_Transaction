'use strict';
/**
 * Métriques Prometheus (étape 4 de l'exercice 6) :
 *   http_requests_total             compteur des requêtes   {method, route, status_code}
 *   http_request_errors_total       compteur des erreurs    {method, route, status_code, error_type}
 *   http_request_duration_seconds   histogramme des temps de réponse {method, route, status_code}
 *   http_requests_in_flight         jauge des requêtes en cours
 *   transactions_operations_total   compteur métier {operation = creation|modification|suppression}
 * + métriques standard du processus Node.js (CPU, mémoire, event loop).
 *
 * Le label "route" contient le MODÈLE de route (/api/transactions/:reference) et
 * non l'URL réelle : sinon chaque référence créerait une nouvelle série temporelle.
 */
const client = require('prom-client');

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const ROUTES_IGNOREES = new Set(['/metrics']);

function creerMetriques() {
  const registre = new client.Registry();
  registre.setDefaultLabels({ service: 'api-transactions' });
  client.collectDefaultMetrics({ register: registre });

  const requetes = new client.Counter({
    name: 'http_requests_total',
    help: 'Nombre total de requêtes HTTP reçues',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registre]
  });
  const erreurs = new client.Counter({
    name: 'http_request_errors_total',
    help: 'Nombre de requêtes terminées en erreur (4xx = client, 5xx = serveur)',
    labelNames: ['method', 'route', 'status_code', 'error_type'],
    registers: [registre]
  });
  const duree = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Temps de réponse des requêtes HTTP en secondes',
    labelNames: ['method', 'route', 'status_code'],
    buckets: BUCKETS,
    registers: [registre]
  });
  const enCours = new client.Gauge({
    name: 'http_requests_in_flight',
    help: 'Requêtes HTTP en cours de traitement',
    registers: [registre]
  });
  const operations = new client.Counter({
    name: 'transactions_operations_total',
    help: 'Opérations d\'écriture réussies sur les transactions',
    labelNames: ['operation'],
    registers: [registre]
  });
  for (const op of ['creation', 'modification', 'suppression']) operations.inc({ operation: op }, 0);

  /** À placer sur chaque route : mémorise le modèle de route pour le label. */
  function marquerRoute(req, res, next) {
    const chemin = `${req.baseUrl}${req.route.path}`;
    res.locals.routeMetrique = chemin.length > 1 ? chemin.replace(/\/$/, '') : chemin;
    next();
  }

  function middleware(req, res, next) {
    if (ROUTES_IGNOREES.has(req.path)) return next();
    const debut = process.hrtime.bigint();
    enCours.inc();
    let termine = false;
    const terminer = () => {
      if (termine) return;
      termine = true;
      enCours.dec();
      const labels = {
        method: req.method,
        route: res.locals.routeMetrique || 'route_inconnue',
        status_code: String(res.statusCode)
      };
      requetes.inc(labels);
      duree.observe(labels, Number(process.hrtime.bigint() - debut) / 1e9);
      if (res.statusCode >= 400) {
        erreurs.inc({ ...labels, error_type: res.statusCode >= 500 ? 'serveur' : 'client' });
      }
    };
    res.on('finish', terminer);
    res.on('close', terminer); // client déconnecté avant la fin
    next();
  }

  async function exposer(req, res) {
    res.set('Content-Type', registre.contentType);
    res.end(await registre.metrics());
  }

  return { registre, middleware, marquerRoute, exposer, operations };
}

module.exports = { creerMetriques, BUCKETS };
