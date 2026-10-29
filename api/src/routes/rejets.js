'use strict';
/**
 * Routes de consultation des résultats du workflow KNIME :
 *   GET /api/rejets                 transactions rejetées (filtre ?motif=, pagination)
 *   GET /api/rejets/statistiques    nombre de rejets par motif
 *   GET /api/chargements/dernier    compte rendu du dernier chargement KNIME -> PostgreSQL
 */
const express = require('express');
const { lireRequeteRejets } = require('../validation/query');
const { erreurIntrouvable } = require('../errors');

function routesRejets({ depot, metriques }) {
  const router = express.Router();
  const m = metriques.marquerRoute;

  router.get('/', m, async (req, res) => {
    const requete = lireRequeteRejets(req.query);
    const { lignes, total } = await depot.rechercherRejets(requete);
    res.json({
      donnees: lignes,
      pagination: { page: requete.page, limite: requete.limite, total, total_pages: Math.ceil(total / requete.limite) },
      filtres: requete.filtres
    });
  });

  router.get('/statistiques', m, async (req, res) => {
    const motifs = await depot.rejetsParMotif();
    res.json({ total: motifs.reduce((s, x) => s + x.nombre, 0), par_motif: motifs });
  });

  return router;
}

function routesChargements({ depot, metriques }) {
  const router = express.Router();
  router.get('/dernier', metriques.marquerRoute, async (req, res) => {
    const c = await depot.dernierChargement();
    if (!c) throw erreurIntrouvable('Aucun chargement effectué : lancez npm run load (voir README)');
    res.json(c);
  });
  return router;
}

module.exports = { routesRejets, routesChargements };
