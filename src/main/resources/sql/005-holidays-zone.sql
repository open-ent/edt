-- Zone de vacances scolaires par établissement : déduite de l'académie (source ACADEMY)
-- ou choisie par l'établissement (source MANUAL).
CREATE TABLE IF NOT EXISTS edt.structure_holidays_zone (
    id_structure character varying(36) NOT NULL PRIMARY KEY,
    zone         character varying(64) NOT NULL,
    source       character varying(16) NOT NULL DEFAULT 'ACADEMY',
    academy      character varying(128),
    updated_at   timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT structure_holidays_zone_source_check CHECK (source IN ('ACADEMY', 'MANUAL'))
);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON edt.structure_holidays_zone TO "apps";

-- Origine des périodes de viesco.setting_period : IMPORT (vacances et jours fériés importés
-- par l'EDT, remplacés à chaque rafraîchissement) ou MANUAL (saisies de l'établissement,
-- jamais touchées). La table appartient à vie-scolaire : on ne la modifie que si elle existe.
DO $$
BEGIN
    IF to_regclass('viesco.setting_period') IS NOT NULL THEN
        ALTER TABLE viesco.setting_period
            ADD COLUMN IF NOT EXISTS source character varying(16) NOT NULL DEFAULT 'MANUAL';

        -- Les vacances et jours fériés déjà importés portent les libellés des deux API
        -- (data.education.gouv.fr et calendrier.api.gouv.fr) : on les reconnaît pour que le
        -- premier rafraîchissement les remplace au lieu de les doublonner.
        UPDATE viesco.setting_period
           SET source = 'IMPORT'
         WHERE code = 'EXCLUSION'
           AND source = 'MANUAL'
           AND (description LIKE 'Vacances %'
                OR description LIKE 'Pont %'
                OR description LIKE 'Début des Vacances%'
                OR description IN ('1er janvier', 'Lundi de Pâques', '1er mai', '8 mai', 'Ascension',
                                   'Lundi de Pentecôte', '14 juillet', 'Assomption', 'Toussaint',
                                   '11 novembre', 'Jour de Noël'));
    END IF;
END$$;
