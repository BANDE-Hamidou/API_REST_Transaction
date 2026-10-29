'use strict';
const { ApiError } = require('../errors');

// Codes d'erreur réseau / PostgreSQL signifiant « base indisponible »
const CODES_BASE_INDISPONIBLE = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN',
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006'
]);

function estBaseIndisponible(err) {
  return CODES_BASE_INDISPONIBLE.has(err.code) ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(err.message || '');
}

function routeIntrouvable(req, res) {
  res.status(404).json({ erreur: { code: 'ROUTE_INTROUVABLE', message: `Aucune route pour ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
function gestionnaireErreurs(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statut).json({ erreur: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: { code: 'JSON_INVALIDE', message: 'Le corps de la requête n\'est pas un JSON valide' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ erreur: { code: 'CORPS_TROP_VOLUMINEUX', message: 'Corps de requête trop volumineux (100 ko max)' } });
  }
  if (estBaseIndisponible(err)) {
    console.error(`[api] base de données indisponible : ${err.code || ''} ${err.message || ''}`.trim());
    return res.status(503).json({ erreur: { code: 'BASE_INDISPONIBLE', message: 'La base de données est momentanément indisponible' } });
  }
  if (err.code === '23514' || err.code === '23502') {
    // violation d'une contrainte CHECK / NOT NULL : la validation applicative aurait dû l'intercepter
    return res.status(400).json({ erreur: { code: 'CONTRAINTE_VIOLEE', message: err.detail || err.message } });
  }
  console.error('[api] erreur interne :', err);
  return res.status(500).json({ erreur: { code: 'ERREUR_INTERNE', message: 'Erreur interne du serveur' } });
}

module.exports = { gestionnaireErreurs, routeIntrouvable, estBaseIndisponible };
