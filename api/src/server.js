'use strict';
/** Point d'entrée : connexion PostgreSQL, démarrage HTTP, arrêt propre. */
const config = require('./config');
const { creerPool } = require('./db/pool');
const { creerDepotTransactions } = require('./repositories/transactionRepository');
const { creerApp } = require('./app');

const pool = creerPool(config.db);
const app = creerApp({ depot: creerDepotTransactions(pool), journaliser: config.logRequests });

const serveur = app.listen(config.port, () => {
  console.log(`[api] à l'écoute sur http://localhost:${config.port} (base ${config.db.host}:${config.db.port}/${config.db.database})`);
});

function arreter(signal) {
  console.log(`[api] ${signal} reçu, arrêt en cours...`);
  serveur.close(async () => {
    await pool.end().catch(() => {});
    console.log('[api] arrêt terminé');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
