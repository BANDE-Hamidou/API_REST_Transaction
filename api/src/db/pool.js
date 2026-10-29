'use strict';
const { Pool, types } = require('pg');

// Par défaut, node-postgres convertit TIMESTAMP en objet Date dans le fuseau du
// serveur Node, ce qui décale les heures selon la machine. On garde le texte
// renvoyé par PostgreSQL et on le met au format ISO AAAA-MM-JJThh:mm:ss.
types.setTypeParser(1114, (v) => v.replace(' ', 'T').slice(0, 19)); // TIMESTAMP
types.setTypeParser(1700, (v) => Number(v)); // NUMERIC -> nombre (2 décimales, 15 chiffres max)
types.setTypeParser(20, (v) => Number(v)); // BIGINT (COUNT, id)

function creerPool(configDb) {
  const pool = new Pool(configDb);
  // une connexion inactive coupée (redémarrage de PostgreSQL) ne doit pas arrêter l'API
  pool.on('error', (err) => console.error('[db] erreur sur une connexion inactive :', err.message));
  return pool;
}

module.exports = { creerPool };
