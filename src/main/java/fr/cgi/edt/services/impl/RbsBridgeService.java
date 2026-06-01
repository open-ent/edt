package fr.cgi.edt.services.impl;

import fr.cgi.edt.core.constants.Field;
import io.vertx.core.eventbus.EventBus;
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

            eb.request(RBS_BUS, msg, reply -> {
                if (reply.failed()) {
                    log.error("[EDT@RbsBridgeService] RBS bus error for course " + course.getString(Field._ID) + ": " + reply.cause().getMessage());
                } else {
                    log.info("[EDT@RbsBridgeService] RBS bookings synced for course " + course.getString(Field._ID));
                }
            });
        }
    }

    private static long parseEdtDate(String dateStr) {
        return LocalDateTime.parse(dateStr, EDT_FMT)
                .atZone(ZONE)
                .toEpochSecond();
    }
}
