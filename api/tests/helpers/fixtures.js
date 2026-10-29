'use strict';
/** Jeu de données de test, conforme au contrat (docs/CONTRATS.md). */
const transactions = [
  { reference: 'TXN-000001', compte_source: 'CPT10000001', compte_destination: null, type: 'DEPOT', montant: 50000, devise: 'XOF', date_transaction: '2026-01-05T09:00:00', statut: 'EFFECTUEE', canal: 'GUICHET', description: 'Depot especes', categorie_montant: 'FAIBLE' },
  { reference: 'TXN-000002', compte_source: 'CPT10000002', compte_destination: 'CPT10000001', type: 'VIREMENT', montant: 250000, devise: 'XOF', date_transaction: '2026-02-10T14:30:00', statut: 'EFFECTUEE', canal: 'MOBILE', description: 'Virement loyer', categorie_montant: 'MOYEN' },
  { reference: 'TXN-000003', compte_source: 'CPT10000003', compte_destination: null, type: 'RETRAIT', montant: 1500000, devise: 'XOF', date_transaction: '2026-03-15T11:15:00', statut: 'EN_ATTENTE', canal: 'GAB', description: 'Retrait especes', categorie_montant: 'ELEVE' },
  { reference: 'TXN-000004', compte_source: 'CPT10000001', compte_destination: 'CPT90000001', type: 'PAIEMENT', montant: 120.5, devise: 'EUR', date_transaction: '2026-03-20T08:45:10', statut: 'ANNULEE', canal: 'INTERNET', description: 'Achat marchand', categorie_montant: 'FAIBLE' },
  { reference: 'TXN-000005', compte_source: 'CPT10000004', compte_destination: 'CPT10000002', type: 'VIREMENT', montant: 75000, devise: 'XOF', date_transaction: '2026-04-01T16:00:00', statut: 'EFFECTUEE', canal: 'INTERNET', description: 'Transfert familial', categorie_montant: 'FAIBLE' }
];

const rejets = [
  { id: 1, reference: 'TXN-000099', montant: '-500.00', motif_rejet: 'MONTANT_NEGATIF' },
  { id: 2, reference: null, montant: '1000.00', motif_rejet: 'REFERENCE_MANQUANTE' },
  { id: 3, reference: 'TXN-000098', montant: '0.00', motif_rejet: 'MONTANT_NEGATIF' }
];

const nouvelle = () => ({
  reference: 'TXN-900001',
  compte_source: 'CPT10000010',
  compte_destination: 'CPT10000011',
  type: 'VIREMENT',
  montant: 125000,
  devise: 'XOF',
  date_transaction: '2026-10-28T10:00:00',
  statut: 'EN_ATTENTE',
  canal: 'MOBILE',
  description: 'Test creation'
});

module.exports = { transactions, rejets, nouvelle };
