package fr.cgi.edt.services;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.List;

/**
 * Vacances scolaires par zone : zone de chaque établissement (déduite de son académie ou
 * choisie par lui), rafraîchissement automatique des périodes importées, et lecture des
 * périodes de fermeture pour l'affichage (agenda, grille d'emploi du temps).
 */
public interface HolidaysService {

    String SOURCE_ACADEMY = "ACADEMY";
    String SOURCE_MANUAL = "MANUAL";

    /**
     * @return {zone, source, academy, detectedZone, detectedAcademy} ; zone vaut null quand elle
     * n'a pu être déduite et que l'établissement ne l'a pas choisie.
     * Ex. {zone: "Zone B", source: "ACADEMY", academy: "Rennes", detectedZone: "Zone B", detectedAcademy: "Rennes"}
     */
    Future<JsonObject> getZone(String structureId);

    /**
     * Force la zone de l'établissement, ou revient à la zone de l'académie quand {@code zone} est
     * null, puis rafraîchit ses vacances.
     *
     * @return même forme que {@link #getZone}, plus {@code refresh} : le résultat du rafraîchissement
     */
    Future<JsonObject> setZone(String structureId, String zone);

    /** Zone retenue pour l'établissement : forcée, sinon déduite (et mémorisée). null si inconnue. */
    Future<String> resolveZone(String structureId);

    /**
     * Mémorise la zone choisie lors d'une initialisation : MANUAL si elle diffère de la zone
     * de l'académie, ACADEMY sinon.
     */
    Future<Void> rememberInitZone(String structureId, String zone);

    /** Rafraîchit les vacances d'un établissement ({status: ok | skipped, …}). */
    Future<JsonObject> refreshStructure(String structureId);

    /** Rafraîchit tous les établissements initialisés, un à un. @return {refreshed, skipped, failed} */
    Future<JsonObject> refreshAll();

    /**
     * Périodes de fermeture (vacances, jours fériés, exclusions saisies) des établissements qui
     * chevauchent [start, end] (dates ISO {@code yyyy-MM-dd}).
     *
     * @return [{structureId, zone, startDate, endDate, description, source, kind}], où kind vaut
     * {@code holiday} (vacances importées), {@code public-holiday} (jour férié importé) ou
     * {@code closure} (exclusion saisie par l'établissement)
     */
    Future<JsonArray> getHolidays(List<String> structureIds, String start, String end);
}
