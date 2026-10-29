'use strict';
/**
 * Configuration lue dans les variables d'environnement.
 * - Dans Docker Compose : valeurs fournies par docker-compose.yml (PGHOST=postgres...).
 * - En local (npm run dev) : fichier ../.env (copie de .env.example), PGHOST=localhost.
 */
const env = process.env;

module.exports = {
  port: Number(env.PORT || env.API_PORT || 3000),
  logRequests: env.NODE_ENV !== 'test' && env.LOG_REQUESTS !== 'false',
  db: {
    host: env.PGHOST || 'localhost',
    port: Number(env.PGPORT || env.POSTGRES_HOST_PORT || 5432),
    user: env.PGUSER || env.POSTGRES_USER || 'transactions',
    password: env.PGPASSWORD || env.POSTGRES_PASSWORD || 'transactions',
    database: env.PGDATABASE || env.POSTGRES_DB || 'transactions',
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000
  },
  pagination: { limiteParDefaut: 20, limiteMax: 100 }
};
