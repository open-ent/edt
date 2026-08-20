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
     * Fire-and-forget: builds RBS save-bookings messages for every course
     * that carries rbsResourceIds and sends them on the event bus.
     *
     * @param eb      Vert.x EventBus
     * @param courses array of EDT course JsonObjects (as received by create/update)
     * @param userId  OpenENT user ID that will own the bookings
     */
    public static void syncBookings(EventBus eb, JsonArray courses, String userId) {
        if (eb == null || courses == null || courses.isEmpty() || userId == null) return;

        for (int i = 0; i < courses.size(); i++) {
            Object raw = courses.getValue(i);
            if (!(raw instanceof JsonObject)) continue;
            JsonObject course = (JsonObject) raw;

            JsonArray rbsResourceIds = course.getJsonArray(Field.RBS_RESOURCE_IDS, null);
            if (rbsResourceIds == null || rbsResourceIds.isEmpty()) continue;

            String startStr = course.getString(Field.STARTDATE);
            String endStr   = course.getString(Field.ENDDATE);
            if (startStr == null || endStr == null) continue;

            long startEpoch, endEpoch;
            try {
                startEpoch = parseEdtDate(startStr);
                endEpoch   = parseEdtDate(endStr);
            } catch (DateTimeParseException e) {
                log.warn("[EDT@RbsBridgeService] Cannot parse dates '" + startStr + "'/'" + endStr + "': " + e.getMessage());
                continue;
            }

            JsonArray slots = new JsonArray().add(
                    new JsonObject()
                            .put("start_date", startEpoch)
                            .put("end_date",   endEpoch)
                            .put("iana",       RBS_IANA)
            );

            JsonArray bookings = new JsonArray();
            for (int j = 0; j < rbsResourceIds.size(); j++) {
                Integer resourceId = rbsResourceIds.getInteger(j);
                if (resourceId == null) continue;
                bookings.add(new JsonObject()
                        .put("resource",       new JsonObject().put("id", resourceId))
                        .put("slots",          slots)
                        .put("booking_reason", "EDT")
                        .put("iana",           RBS_IANA)
                );
            }

            if (bookings.isEmpty()) continue;

            JsonObject msg = new JsonObject()
                    .put("action",   "save-bookings")
                    .put("userId",   userId)
                    .put("bookings", bookings);

            String courseId = course.getString(Field._ID);
            eb.request(RBS_BUS, msg, reply -> {
                if (reply.failed()) {
                    log.error("[EDT@RbsBridgeService] RBS bus error for course " + courseId + ": " + reply.cause().getMessage());
                    return;
                }
                log.info("[EDT@RbsBridgeService] RBS bookings synced for course " + courseId);
                // La réponse "save-bookings" porte les réservations créées (avec leur id) — on
                // les persiste sur le cours pour pouvoir les supprimer plus tard ("delete-
                // bookings" prend des ids de réservation, jamais capturés sinon puisque cet
                // appel était fire-and-forget).
                if (courseId == null) return;
                JsonArray created = extractCreatedBookings((JsonObject) reply.result().body());
                JsonArray bookingIds = new JsonArray();
                for (int k = 0; k < created.size(); k++) {
                    Integer bookingId = created.getJsonObject(k).getInteger("id");
                    if (bookingId != null) bookingIds.add(bookingId);
                }
                if (bookingIds.isEmpty()) return;

                MongoUpdateBuilder update = new MongoUpdateBuilder();
                update.set(Field.RBS_BOOKING_IDS, bookingIds);
                MongoDb.getInstance().update(Edt.EDT_COLLECTION, new JsonObject().put(Field._ID, courseId), update.build(),
                        res -> {
                            if (!"ok".equals(res.body().getString("status"))) {
                                log.error("[EDT@RbsBridgeService] Failed to persist rbsBookingIds on course " + courseId);
                            }
                        });
            });
        }
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
