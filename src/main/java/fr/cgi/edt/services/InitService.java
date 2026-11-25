package fr.cgi.edt.services;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;

public interface InitService {

    /**
     * Script method to initialize all dates to viescolaire table setting period
     *
     * @param structure             structure identifier
     * @param zone                  school's zone (A, B or C accepted)
     * @param initSchoolYear        true if we want to initialize school year
     * @param schoolYearStartDate   start date of the school year
     * @param schoolYearEndDate     end date of the school year
     * @return                      future with json object
     */
    Future<JsonObject> init(String structure, String zone, boolean initSchoolYear,
                            String schoolYearStartDate, String schoolYearEndDate);

    /**
     * Réimporte les vacances scolaires et jours fériés de l'année scolaire en cours et de la
     * suivante, en ne remplaçant que les périodes importées (source IMPORT).
     *
     * @param structure structure identifier
     * @param zone      zone de vacances (« Zone B », « Corse »…)
     * @return          {status: ok, zone, schoolYears} ou {status: skipped} si l'établissement n'a pas d'année scolaire
     */
    Future<JsonObject> refresh(String structure, String zone);
}
