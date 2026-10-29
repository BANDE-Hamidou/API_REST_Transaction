'use strict';
/**
 * Erreurs applicatives. Chaque erreur porte un statut HTTP et un code stable,
 * renvoyés au client sous la forme : { "erreur": { "code", "message", "details" } }.
 */
class ApiError extends Error {
  constructor(statut, code, message, details) {
    super(message);
    this.statut = statut;
    this.code = code;
    this.details = details;
  }
}

const erreurValidation = (details, message = 'Données invalides') =>
  new ApiError(400, 'VALIDATION_ECHOUEE', message, details);
const erreurIntrouvable = (message) => new ApiError(404, 'RESSOURCE_INTROUVABLE', message);
const erreurConflit = (message) => new ApiError(409, 'CONFLIT', message);

module.exports = { ApiError, erreurValidation, erreurIntrouvable, erreurConflit };
