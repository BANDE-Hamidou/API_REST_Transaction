'use strict';
/**
 * Routes /api/transactions
 *   GET    /                 liste filtrée, paginée et triée
 *   GET    /statistiques     agrégats par type et devise (mêmes filtres)
 *   GET    /:reference       détail
 *   POST   /                 création (source = API)
 *   PATCH  /:reference       modification partielle
 *   DELETE /:reference       suppression
 * Express 5 transmet automatiquement les erreurs des fonctions async au gestionnaire d'erreurs.
 */
const express = require('express');
const { lireRequeteTransactions, lireReference } = require('../validation/query');
const { validerCreation, validerModification } = require('../validation/transaction');
const { erreurIntrouvable } = require('../errors');

function routesTransactions({ depot, metriques }) {
  const router = express.Router();
  const m = metriques.marquerRoute;

  router.get('/', m, async (req, res) => {
    const requete = lireRequeteTransactions(req.query);
    const { lignes, total } = await depot.rechercher(requete);
    res.json({
      donnees: lignes,
      pagination: {
        page: requete.page,
        limite: requete.limite,
        total,
        total_pages: Math.ceil(total / requete.limite)
      },
      filtres: requete.filtres,
      tri: { champ: requete.tri, ordre: requete.ordre }
    });
  });

  router.get('/statistiques', m, async (req, res) => {
    const { filtres } = lireRequeteTransactions(req.query);
    res.json({ donnees: await depot.statistiques(filtres), filtres });
  });

  router.get('/:reference', m, async (req, res) => {
    const reference = lireReference(req.params.reference);
    const t = await depot.trouver(reference);
    if (!t) throw erreurIntrouvable(`Transaction ${reference} introuvable`);
    res.json(t);
  });

  router.post('/', m, async (req, res) => {
    const t = validerCreation(req.body);
    const creee = await depot.creer(t);
    metriques.operations.inc({ operation: 'creation' });
    res.status(201).location(`${req.baseUrl}/${creee.reference}`).json(creee);
  });

  router.patch('/:reference', m, async (req, res) => {
    const reference = lireReference(req.params.reference);
    const existante = await depot.trouver(reference);
    if (!existante) throw erreurIntrouvable(`Transaction ${reference} introuvable`);
    const t = validerModification(existante, req.body);
    const modifiee = await depot.modifier(reference, t);
    if (!modifiee) throw erreurIntrouvable(`Transaction ${reference} introuvable`);
    metriques.operations.inc({ operation: 'modification' });
    res.json(modifiee);
  });

  router.delete('/:reference', m, async (req, res) => {
    const reference = lireReference(req.params.reference);
    if (!(await depot.supprimer(reference))) throw erreurIntrouvable(`Transaction ${reference} introuvable`);
    metriques.operations.inc({ operation: 'suppression' });
    res.status(204).end();
  });

  return router;
}

module.exports = { routesTransactions };
