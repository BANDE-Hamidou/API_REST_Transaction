-- =============================================================================
-- Groupe 5 - Thème 6 : schéma de la base "transactions" (PostgreSQL 16)
-- Exécuté automatiquement par le conteneur postgres au PREMIER démarrage
-- (dossier monté sur /docker-entrypoint-initdb.d).
-- Pour le rejouer : docker compose down -v  puis  docker compose up -d
-- =============================================================================

-- Transactions VALIDES : alimentées par le workflow KNIME (source = 'KNIME')
-- puis par l'API REST (source = 'API').
CREATE TABLE IF NOT EXISTS transactions (
    id                  BIGSERIAL      PRIMARY KEY,
    reference           VARCHAR(10)    NOT NULL UNIQUE
                        CHECK (reference ~ '^TXN-[0-9]{6}$'),
    compte_source       VARCHAR(11)    NOT NULL
                        CHECK (compte_source ~ '^CPT[0-9]{8}$'),
    compte_destination  VARCHAR(11)
                        CHECK (compte_destination ~ '^CPT[0-9]{8}$'),
    type                VARCHAR(10)    NOT NULL
                        CHECK (type IN ('DEPOT', 'RETRAIT', 'VIREMENT', 'PAIEMENT')),
    montant             NUMERIC(15, 2) NOT NULL CHECK (montant > 0),
    devise              CHAR(3)        NOT NULL DEFAULT 'XOF'
                        CHECK (devise IN ('XOF', 'EUR', 'USD')),
    date_transaction    TIMESTAMP      NOT NULL,
    statut              VARCHAR(10)    NOT NULL
                        CHECK (statut IN ('EFFECTUEE', 'EN_ATTENTE', 'ANNULEE')),
    canal               VARCHAR(8)     NOT NULL
                        CHECK (canal IN ('GUICHET', 'GAB', 'MOBILE', 'INTERNET')),
    description         VARCHAR(255),
    categorie_montant   VARCHAR(6)     NOT NULL
                        CHECK (categorie_montant IN ('FAIBLE', 'MOYEN', 'ELEVE')),
    source              VARCHAR(5)     NOT NULL DEFAULT 'API'
                        CHECK (source IN ('KNIME', 'API')),
    cree_le             TIMESTAMPTZ    NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ    NOT NULL DEFAULT now(),
    -- règles métier inter-colonnes (identiques au workflow KNIME)
    CONSTRAINT ck_virement_destination CHECK (type <> 'VIREMENT' OR compte_destination IS NOT NULL),
    CONSTRAINT ck_comptes_differents   CHECK (compte_destination IS NULL OR compte_destination <> compte_source)
);

-- Index pour les filtres de l'API
CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions (date_transaction);
CREATE INDEX IF NOT EXISTS idx_tx_type     ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_tx_statut   ON transactions (statut);
CREATE INDEX IF NOT EXISTS idx_tx_source   ON transactions (compte_source);
CREATE INDEX IF NOT EXISTS idx_tx_dest     ON transactions (compte_destination);
CREATE INDEX IF NOT EXISTS idx_tx_montant  ON transactions (montant);

-- Transactions REJETÉES par le workflow KNIME, avec leur motif.
-- Les valeurs sont stockées en texte : elles sont par définition invalides.
CREATE TABLE IF NOT EXISTS transactions_rejetees (
    id                  BIGSERIAL    PRIMARY KEY,
    reference           TEXT,
    compte_source       TEXT,
    compte_destination  TEXT,
    type                TEXT,
    montant             TEXT,
    devise              TEXT,
    date_transaction    TEXT,
    statut              TEXT,
    canal               TEXT,
    description         TEXT,
    motif_rejet         VARCHAR(40)  NOT NULL,
    chargement_id       BIGINT,
    rejete_le           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rej_motif ON transactions_rejetees (motif_rejet);

-- Journal des chargements (traçabilité KNIME -> base)
CREATE TABLE IF NOT EXISTS chargements (
    id                  BIGSERIAL    PRIMARY KEY,
    dossier_source      TEXT         NOT NULL,
    lignes_valides_lues INTEGER      NOT NULL,
    lignes_inserees     INTEGER      NOT NULL,
    lignes_mises_a_jour INTEGER      NOT NULL,
    lignes_rejetees     INTEGER      NOT NULL,
    rejets_au_chargement INTEGER     NOT NULL DEFAULT 0,
    debut               TIMESTAMPTZ  NOT NULL,
    fin                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE transactions_rejetees
    ADD CONSTRAINT fk_rej_chargement FOREIGN KEY (chargement_id) REFERENCES chargements (id) ON DELETE SET NULL;

-- Mise à jour automatique de modifie_le
CREATE OR REPLACE FUNCTION maj_modifie_le() RETURNS TRIGGER AS $$
BEGIN
    NEW.modifie_le := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tx_modifie_le ON transactions;
CREATE TRIGGER trg_tx_modifie_le
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION maj_modifie_le();
