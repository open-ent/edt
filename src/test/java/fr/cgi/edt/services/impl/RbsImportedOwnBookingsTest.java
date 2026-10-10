package fr.cgi.edt.services.impl;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Réservations posées par l'import des salles, reconnues comme celles du cours (salle + horaires exacts). */
class RbsImportedOwnBookingsTest {

    private final JsonArray resources = new JsonArray()
            .add(new JsonObject().put("id", 48).put("name", "Amphithéâtre4"))
            .add(new JsonObject().put("id", 46).put("name", "Amphithéâtre 2"));

    private static JsonObject booking(int id, int resource, String start, String end) {
        return new JsonObject().put("id", id).put("resource_id", resource).put("start_local", start).put("end_local", end);
    }

    @Test
    void memeSalleEtMemesHorairesExacts() {
        JsonObject course = new JsonObject().put("startDate", "2026-10-16T08:00:00").put("endDate", "2026-10-16T09:00:00")
                .put("roomLabels", new JsonArray().add(" amphithéâtre4 "));
        JsonArray bookings = new JsonArray()
                .add(booking(3467, 48, "2026-10-16T08:00:00", "2026-10-16T09:00:00"))
                .add(booking(3551, 48, "2026-10-16T09:00:00", "2026-10-16T10:00:00"))
                .add(booking(4000, 46, "2026-10-16T08:00:00", "2026-10-16T09:00:00"));
        assertEquals(new JsonArray().add(3467), RbsBridgeService.importedOwnBookings(course, resources, bookings));
    }

    @Test
    void dateAvecEspaceEtCoursSansSalle() {
        JsonArray bookings = new JsonArray().add(booking(3467, 48, "2026-10-16T08:00:00", "2026-10-16T09:00:00"));
        JsonObject spaced = new JsonObject().put("startDate", "2026-10-16 08:00:00").put("endDate", "2026-10-16 09:00:00")
                .put("roomLabels", new JsonArray().add("Amphithéâtre4"));
        assertEquals(new JsonArray().add(3467), RbsBridgeService.importedOwnBookings(spaced, resources, bookings));
        JsonObject noRoom = spaced.copy().put("roomLabels", new JsonArray());
        assertEquals(new JsonArray(), RbsBridgeService.importedOwnBookings(noRoom, resources, bookings));
    }
}
