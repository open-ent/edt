package fr.cgi.edt.services.impl;

import fr.cgi.edt.core.enums.Zone;
import fr.cgi.edt.helper.AcademyZoneHelper;
import fr.cgi.edt.models.holiday.HolidaysConfig;
import fr.cgi.edt.services.HolidaysService;
import fr.cgi.edt.services.InitService;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.codec.BodyCodec;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DefaultHolidaysService implements HolidaysService {

    private static final Logger log = LoggerFactory.getLogger(DefaultHolidaysService.class);
    /** Table académie → zone, tirée des deux dernières années du calendrier scolaire. */
    static final String ACADEMY_ZONES_ENDPOINT = "/api/explore/v2.1/catalog/datasets/"
            + DefaultInitImpl.SCHOOL_HOLIDAY_DATASET + "/records";
    private static final long ACADEMY_ZONES_TTL_MS = 24L * 3600 * 1000;

    private final Sql sql;
    private final Neo4j neo4j;
    private final WebClient client;
    private final HolidaysConfig holidaysConfig;
    private final InitService initService;

    /** Nom d'académie normalisé → {academy: libellé du jeu de données, zone}. */
    private Map<String, JsonObject> academyZones = new HashMap<>();
    private long academyZonesLoadedAt = 0;

    public DefaultHolidaysService(Vertx vertx, Sql sql, Neo4j neo4j, HolidaysConfig holidaysConfig, InitService initService) {
        this(WebClient.create(vertx), sql, neo4j, holidaysConfig, initService);
    }

    DefaultHolidaysService(WebClient client, Sql sql, Neo4j neo4j, HolidaysConfig holidaysConfig, InitService initService) {
        this.client = client;
        this.sql = sql;
        this.neo4j = neo4j;
        this.holidaysConfig = holidaysConfig;
        this.initService = initService;
    }

    public static boolean isValidZone(String zone) {
        return zone != null && Stream.of(Zone.values()).anyMatch(z -> z.zone().equals(zone));
    }

    // ------------------------------------------------------------------ zone

    @Override
    public Future<JsonObject> getZone(String structureId) {
        Future<JsonObject> stored = storedZone(structureId);
        Future<JsonObject> detected = detectZone(structureId);
        return Future.all(stored, detected).map(unused -> {
            JsonObject row = stored.result();
            JsonObject guess = detected.result();
            JsonObject result = new JsonObject()
                    .put("detectedZone", guess.getString("zone"))
                    .put("detectedAcademy", guess.getString("academy"));
            if (row != null && SOURCE_MANUAL.equals(row.getString("source"))) {
                return result.put("zone", row.getString("zone"))
                        .put("source", SOURCE_MANUAL)
                        .put("academy", guess.getString("academy"));
            }
            String zone = guess.getString("zone") != null ? guess.getString("zone")
                    : row != null ? row.getString("zone") : null;
            return result.put("zone", zone)
                    .put("source", zone == null ? null : SOURCE_ACADEMY)
                    .put("academy", guess.getString("academy"));
        });
    }

    @Override
    public Future<JsonObject> setZone(String structureId, String zone) {
        Future<Void> write;
        if (zone == null) {
            write = execute("DELETE FROM edt.structure_holidays_zone WHERE id_structure = ?",
                    new JsonArray().add(structureId));
        } else if (!isValidZone(zone)) {
            return Future.failedFuture("invalid zone: " + zone);
        } else {
            write = detectZone(structureId).compose(guess ->
                    upsert(structureId, zone, SOURCE_MANUAL, guess.getString("academy")));
        }
        return write
                .compose(unused -> refreshStructure(structureId)
                        .recover(err -> Future.succeededFuture(new JsonObject()
                                .put("status", "error").put("message", err.getMessage()))))
                .compose(refresh -> getZone(structureId).map(z -> z.put("refresh", refresh)));
    }

    @Override
    public Future<String> resolveZone(String structureId) {
        return storedZone(structureId).compose(row -> {
            if (row != null && SOURCE_MANUAL.equals(row.getString("source"))) {
                return Future.succeededFuture(row.getString("zone"));
            }
            return detectZone(structureId).compose(guess -> {
                String zone = guess.getString("zone");
                if (zone == null) {
                    return Future.succeededFuture(row == null ? null : row.getString("zone"));
                }
                if (row != null && zone.equals(row.getString("zone"))) {
                    return Future.succeededFuture(zone);
                }
                return upsert(structureId, zone, SOURCE_ACADEMY, guess.getString("academy")).map(zone);
            });
        });
    }

    @Override
    public Future<Void> rememberInitZone(String structureId, String zone) {
        if (!isValidZone(zone)) return Future.succeededFuture();
        return detectZone(structureId).compose(guess -> {
            String source = zone.equals(guess.getString("zone")) ? SOURCE_ACADEMY : SOURCE_MANUAL;
            return upsert(structureId, zone, source, guess.getString("academy"));
        });
    }

    private Future<JsonObject> storedZone(String structureId) {
        Promise<JsonObject> promise = Promise.promise();
        sql.prepared("SELECT zone, source, academy FROM edt.structure_holidays_zone WHERE id_structure = ?",
                new JsonArray().add(structureId), SqlResult.validUniqueResultHandler(res -> {
                    if (res.isLeft()) promise.fail(res.left().getValue());
                    else promise.complete(res.right().getValue() == null || res.right().getValue().isEmpty()
                            ? null : res.right().getValue());
                }));
        return promise.future();
    }

    private Future<Void> upsert(String structureId, String zone, String source, String academy) {
        return execute("INSERT INTO edt.structure_holidays_zone (id_structure, zone, source, academy, updated_at) " +
                        "VALUES (?, ?, ?, ?, now()) ON CONFLICT (id_structure) DO UPDATE SET zone = EXCLUDED.zone, " +
                        "source = EXCLUDED.source, academy = EXCLUDED.academy, updated_at = now()",
                new JsonArray().add(structureId).add(zone).add(source).add(academy));
    }

    private Future<Void> execute(String query, JsonArray params) {
        Promise<Void> promise = Promise.promise();
        sql.prepared(query, params, SqlResult.validRowsResultHandler(res -> {
            if (res.isLeft()) promise.fail(res.left().getValue());
            else promise.complete();
        }));
        return promise.future();
    }

    /**
     * Zone déduite de l'académie de l'établissement (graphe), à défaut de son département
     * (code postal ou UAI). @return {academy, zone}, vide si rien n'a pu être déduit
     */
    Future<JsonObject> detectZone(String structureId) {
        Future<JsonObject> structure = structureLocation(structureId);
        Future<Map<String, JsonObject>> zones = academyZones();
        return Future.all(structure, zones).map(unused -> {
            JsonObject location = structure.result();
            Map<String, JsonObject> table = zones.result();
            JsonObject match = table.get(AcademyZoneHelper.normalize(location.getString("academy")));
            if (match == null) {
                String fromDepartment = AcademyZoneHelper.academyFromLocation(
                        location.getString("zipCode"), location.getString("uai"));
                match = table.get(AcademyZoneHelper.normalize(fromDepartment));
            }
            return match == null ? new JsonObject() : match.copy();
        }).recover(err -> {
            log.warn(String.format("[Edt@%s::detectZone] Zone of structure %s not detected: %s",
                    this.getClass().getSimpleName(), structureId, err.getMessage()));
            return Future.succeededFuture(new JsonObject());
        });
    }

    private Future<JsonObject> structureLocation(String structureId) {
        Promise<JsonObject> promise = Promise.promise();
        String query = "MATCH (s:Structure {id: $id}) RETURN s.academy AS academy, s.zipCode AS zipCode, s.UAI AS uai";
        neo4j.execute(query, new JsonObject().put("id", structureId), Neo4jResult.validUniqueResultHandler(res -> {
            if (res.isLeft()) promise.fail(res.left().getValue());
            else promise.complete(res.right().getValue() == null ? new JsonObject() : res.right().getValue());
        }));
        return promise.future();
    }

    /** Table académie → zone, rechargée au plus une fois par jour. */
    Future<Map<String, JsonObject>> academyZones() {
        if (!academyZones.isEmpty() && System.currentTimeMillis() - academyZonesLoadedAt < ACADEMY_ZONES_TTL_MS) {
            return Future.succeededFuture(academyZones);
        }
        Promise<Map<String, JsonObject>> promise = Promise.promise();
        client.getAbs(holidaysConfig.schoolHolidaysUrl() + ACADEMY_ZONES_ENDPOINT)
                .addQueryParam("select", "location,zones")
                .addQueryParam("group_by", "location,zones")
                .addQueryParam("where", "end_date>=now(years=-1)")
                .addQueryParam("limit", "100")
                .as(BodyCodec.jsonObject())
                .send(ar -> {
                    if (ar.failed() || ar.result().statusCode() != 200 || ar.result().body() == null) {
                        String error = ar.failed() ? ar.cause().getMessage() : "HTTP " + ar.result().statusCode();
                        log.error(String.format("[Edt@%s::academyZones] Failed to load academies: %s",
                                this.getClass().getSimpleName(), error));
                        // On garde la table précédente plutôt que de tout perdre.
                        if (!academyZones.isEmpty()) promise.complete(academyZones);
                        else promise.fail(error);
                        return;
                    }
                    Map<String, JsonObject> table = parseAcademyZones(ar.result().body().getJsonArray("results", new JsonArray()));
                    if (!table.isEmpty()) {
                        academyZones = table;
                        academyZonesLoadedAt = System.currentTimeMillis();
                    }
                    promise.complete(table);
                });
        return promise.future();
    }

    static Map<String, JsonObject> parseAcademyZones(JsonArray results) {
        Map<String, JsonObject> table = new HashMap<>();
        for (Object o : results) {
            if (!(o instanceof JsonObject)) continue;
            JsonObject row = (JsonObject) o;
            String academy = row.getString("location");
            String zone = row.getString("zones");
            String key = AcademyZoneHelper.normalize(academy);
            if (key != null && isValidZone(zone)) {
                table.put(key, new JsonObject().put("academy", academy).put("zone", zone));
            }
        }
        return table;
    }

    // ------------------------------------------------------------- refresh

    @Override
    public Future<JsonObject> refreshStructure(String structureId) {
        return resolveZone(structureId).compose(zone -> zone == null
                ? Future.succeededFuture(new JsonObject().put("status", "skipped").put("message", "no zone"))
                : initService.refresh(structureId, zone));
    }

    @Override
    public Future<JsonObject> refreshAll() {
        Promise<JsonArray> structures = Promise.promise();
        sql.prepared("SELECT DISTINCT id_structure FROM viesco.setting_period WHERE code = 'YEAR'", new JsonArray(),
                SqlResult.validResultHandler(res -> {
                    if (res.isLeft()) structures.fail(res.left().getValue());
                    else structures.complete(res.right().getValue());
                }));
        return structures.future().compose(rows -> {
            JsonObject report = new JsonObject().put("refreshed", 0).put("skipped", 0).put("failed", 0);
            // Un établissement après l'autre : l'API publique n'a pas à encaisser des centaines
            // d'appels simultanés.
            Future<Void> chain = Future.succeededFuture();
            for (Object o : rows) {
                String structureId = ((JsonObject) o).getString("id_structure");
                chain = chain.compose(unused -> refreshStructure(structureId)
                        .map(res -> {
                            String key = "ok".equals(res.getString("status")) ? "refreshed" : "skipped";
                            report.put(key, report.getInteger(key) + 1);
                            return (Void) null;
                        })
                        .recover(err -> {
                            report.put("failed", report.getInteger("failed") + 1);
                            return Future.succeededFuture();
                        }));
            }
            return chain.map(report);
        });
    }

    // ---------------------------------------------------------------- read

    @Override
    public Future<JsonArray> getHolidays(List<String> structureIds, String start, String end) {
        List<String> ids = structureIds == null ? List.of()
                : structureIds.stream().filter(id -> id != null && !id.isEmpty()).distinct().collect(Collectors.toList());
        if (ids.isEmpty()) return Future.succeededFuture(new JsonArray());
        String query = "SELECT p.id_structure AS \"structureId\", z.zone, " +
                "to_char(p.start_date, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS \"startDate\", " +
                "to_char(p.end_date, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS \"endDate\", " +
                "p.description, p.source, " +
                "CASE WHEN p.source <> '" + DefaultInitImpl.SOURCE_IMPORT + "' THEN 'closure' " +
                "WHEN p.description LIKE 'Vacances%' OR p.description LIKE 'Pont%' OR p.description LIKE 'Début des Vacances%' " +
                "OR p.start_date::date <> p.end_date::date THEN 'holiday' ELSE 'public-holiday' END AS kind " +
                "FROM viesco.setting_period p " +
                "LEFT JOIN edt.structure_holidays_zone z ON z.id_structure = p.id_structure " +
                "WHERE p.code = 'EXCLUSION' AND p.id_structure IN " + Sql.listPrepared(ids) +
                " AND p.end_date >= ?::date AND p.start_date < (?::date + 1) " +
                "ORDER BY p.start_date, p.id_structure";
        JsonArray params = new JsonArray(ids.stream().map(id -> (Object) id).collect(Collectors.toList()))
                .add(start).add(end);
        Promise<JsonArray> promise = Promise.promise();
        sql.prepared(query, params, SqlResult.validResultHandler(res -> {
            if (res.isLeft()) promise.fail(res.left().getValue());
            else promise.complete(res.right().getValue());
        }));
        return promise.future();
    }
}
