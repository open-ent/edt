package fr.cgi.edt.services.impl;

import fr.cgi.edt.Edt;
import fr.cgi.edt.core.constants.Field;
import fr.wseduc.mongodb.MongoDb;
import fr.wseduc.mongodb.MongoUpdateBuilder;
import io.vertx.core.AsyncResult;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Synchronise les réservations RBS quand EDT crée ou modifie un créneau
 * avec des ressources RBS associées (rbsResourceIds).
 * <p>
 * Pour chaque cours portant un rbsResourceIds non-vide, envoie un message
 * "save-bookings" sur le bus net.atos.entng.rbs.
 */
public class RbsBridgeService {

    private static final Logger log = LoggerFactory.getLogger(RbsBridgeService.class);
    private static final String RBS_BUS     = "net.atos.entng.rbs";
    private static final String RBS_IANA    = "Europe/Paris";
    private static final ZoneId ZONE        = ZoneId.of(RBS_IANA);
    private static final DateTimeFormatter EDT_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private RbsBridgeService() {
        throw new IllegalStateException("Utility class");
    }

    /**
     * Builds RBS save-bookings messages for every course that carries rbsResourceIds and sends
     * them on the event bus. Contrairement à l'ancienne version fire-and-forget, attend la fin de
     * tous les appels et renvoie la liste des cours ayant eu au moins une ressource refusée
     * (conflit de créneau) — pour que le contrôleur puisse le signaler à l'enseignant au lieu
     * d'échouer silencieusement.
     *
     * @param eb      Vert.x EventBus
     * @param courses array of EDT course JsonObjects (as received by create/update)
     * @param userId  OpenENT user ID that will own the bookings
     * @return {@link Future<JsonArray>} tableau de {courseId, conflictResourceIds:[...]}, un
     *         élément par cours ayant au moins une ressource non réservée.
     */
    public static Future<JsonArray> syncBookings(EventBus eb, JsonArray courses, String userId) {
        Promise<JsonArray> promise = Promise.promise();
        JsonArray conflicts = new JsonArray();

        List<JsonObject> coursesToSync = new ArrayList<>();
        if (eb != null && courses != null && userId != null) {
            for (int i = 0; i < courses.size(); i++) {
                Object raw = courses.getValue(i);
                if (!(raw instanceof JsonObject)) continue;
                JsonObject course = (JsonObject) raw;
                JsonArray ids = course.getJsonArray(Field.RBS_RESOURCE_IDS, null);
                if (ids != null && !ids.isEmpty()) coursesToSync.add(course);
            }
        }
        if (coursesToSync.isEmpty()) {
            promise.complete(conflicts);
            return promise.future();
        }

        AtomicInteger remaining = new AtomicInteger(coursesToSync.size());
        Runnable checkDone = () -> {
            if (remaining.decrementAndGet() == 0) promise.complete(conflicts);
        };

        for (JsonObject course : coursesToSync) {
            JsonArray rbsResourceIds = course.getJsonArray(Field.RBS_RESOURCE_IDS);
            String courseId = course.getString(Field._ID);
            String startStr = course.getString(Field.STARTDATE);
            String endStr   = course.getString(Field.ENDDATE);
            if (startStr == null || endStr == null) { checkDone.run(); continue; }

            long startEpoch, endEpoch;
            try {
                startEpoch = parseEdtDate(startStr);
                endEpoch   = parseEdtDate(endStr);
            } catch (DateTimeParseException e) {
                log.warn("[EDT@RbsBridgeService] Cannot parse dates '" + startStr + "'/'" + endStr + "': " + e.getMessage());
                checkDone.run();
                continue;
            }

            JsonArray slots = new JsonArray().add(
                    new JsonObject()
                            .put("start_date", startEpoch)
                            .put("end_date",   endEpoch)
                            .put("iana",       RBS_IANA)
            );

            JsonArray bookings = new JsonArray();
            JsonArray requestedResourceIds = new JsonArray();
            for (int j = 0; j < rbsResourceIds.size(); j++) {
                Integer resourceId = rbsResourceIds.getInteger(j);
                if (resourceId == null) continue;
                requestedResourceIds.add(resourceId);
                bookings.add(new JsonObject()
                        .put("resource",       new JsonObject().put("id", resourceId))
                        .put("slots",          slots)
                        .put("booking_reason", "EDT")
                        .put("iana",           RBS_IANA)
                );
            }

            if (bookings.isEmpty()) { checkDone.run(); continue; }

            JsonObject msg = new JsonObject()
                    .put("action",   "save-bookings")
                    .put("userId",   userId)
                    .put("bookings", bookings);

            eb.request(RBS_BUS, msg, reply -> {
                if (reply.failed()) {
                    log.error("[EDT@RbsBridgeService] RBS bus error for course " + courseId + ": " + reply.cause().getMessage());
                    if (courseId != null) {
                        conflicts.add(new JsonObject().put("courseId", courseId).put("conflictResourceIds", requestedResourceIds));
                    }
                    checkDone.run();
                    return;
                }
                log.info("[EDT@RbsBridgeService] RBS bookings synced for course " + courseId);
                // La réponse "save-bookings" porte les réservations réellement créées (avec leur
                // id ET leur resource_id) — on compare aux ressources demandées pour détecter les
                // conflits (WHERE NOT EXISTS côté RBS, silencieux sinon), et on persiste les
                // bookingIds obtenus pour pouvoir les supprimer plus tard ("delete-bookings").
                JsonArray created = extractCreatedBookings((JsonObject) reply.result().body());
                JsonArray bookingIds = new JsonArray();
                JsonArray succeededResourceIds = new JsonArray();
                for (int k = 0; k < created.size(); k++) {
                    JsonObject b = created.getJsonObject(k);
                    Integer bookingId = b.getInteger("id");
                    if (bookingId != null) bookingIds.add(bookingId);
                    Integer rid = b.getInteger("resource_id");
                    if (rid != null) succeededResourceIds.add(rid);
                }

                JsonArray conflictResourceIds = new JsonArray();
                for (int j = 0; j < requestedResourceIds.size(); j++) {
                    Integer rid = requestedResourceIds.getInteger(j);
                    if (!succeededResourceIds.contains(rid)) conflictResourceIds.add(rid);
                }
                if (!conflictResourceIds.isEmpty() && courseId != null) {
                    conflicts.add(new JsonObject().put("courseId", courseId).put("conflictResourceIds", conflictResourceIds));
                }

                if (courseId == null || bookingIds.isEmpty()) { checkDone.run(); return; }

                MongoUpdateBuilder update = new MongoUpdateBuilder();
                update.set(Field.RBS_BOOKING_IDS, bookingIds);
                MongoDb.getInstance().update(Edt.EDT_COLLECTION, new JsonObject().put(Field._ID, courseId), update.build(),
                        res -> {
                            if (!"ok".equals(res.body().getString("status"))) {
                                log.error("[EDT@RbsBridgeService] Failed to persist rbsBookingIds on course " + courseId);
                            }
                            checkDone.run();
                        });
            });
        }

        return promise.future();
    }

    /**
     * Supprime des réservations RBS déjà créées (ids de réservation, pas de ressource) —
     * symétrique de {@link #syncBookings}, à appeler à la suppression d'un cours ou quand ses
     * rbsResourceIds changent/disparaissent, pour ne pas laisser de réservation orpheline.
     *
     * @param eb        Vert.x EventBus
     * @param bookingIds ids de réservations RBS à supprimer (JsonArray d'Integer)
     * @param userId    utilisateur agissant (doit être propriétaire des réservations côté RBS)
     */
    public static void deleteBookings(EventBus eb, JsonArray bookingIds, String userId) {
        if (eb == null || bookingIds == null || bookingIds.isEmpty() || userId == null) return;

        JsonObject msg = new JsonObject()
                .put("action",   "delete-bookings")
                .put("userId",   userId)
                .put("bookings", bookingIds);

        eb.request(RBS_BUS, msg, reply -> {
            if (reply.failed()) {
                log.error("[EDT@RbsBridgeService] RBS delete-bookings error: " + reply.cause().getMessage());
            } else {
                log.info("[EDT@RbsBridgeService] RBS bookings deleted: " + bookingIds);
            }
        });
    }

    /**
     * Liste, sans filtrage par droits RBS, les types et ressources RBS d'une structure — pour
     * peupler un sélecteur de salle accessible à n'importe quel enseignant, même sans droit RBS.
     *
     * @param eb          Vert.x EventBus
     * @param structureId id de la structure
     * @return {@link Future<JsonObject>} {types:[...], resources:[...]}
     */
    public static Future<JsonObject> listResourcesForStructure(EventBus eb, String structureId) {
        Promise<JsonObject> promise = Promise.promise();
        if (eb == null || structureId == null) {
            promise.complete(new JsonObject().put("types", new JsonArray()).put("resources", new JsonArray()));
            return promise.future();
        }

        JsonObject msg = new JsonObject()
                .put("action",      "list-resources")
                .put("structureId", structureId);

        eb.request(RBS_BUS, msg, (AsyncResult<Message<Object>> reply) -> {
            if (reply.failed()) {
                log.error("[EDT@RbsBridgeService] RBS list-resources error: " + reply.cause().getMessage());
                promise.fail(reply.cause());
                return;
            }
            promise.complete((JsonObject) reply.result().body());
        });

        return promise.future();
    }

    private static JsonArray extractCreatedBookings(JsonObject busReply) {
        // BusResponseHandler.busArrayHandler enveloppe la réponse dans {status:"ok", result:[...]}
        if (busReply == null || !"ok".equals(busReply.getString("status"))) return new JsonArray();
        JsonArray result = busReply.getJsonArray("result");
        return result != null ? result : new JsonArray();
    }

    private static long parseEdtDate(String dateStr) {
        return LocalDateTime.parse(dateStr, EDT_FMT)
                .atZone(ZONE)
                .toEpochSecond();
    }
}
