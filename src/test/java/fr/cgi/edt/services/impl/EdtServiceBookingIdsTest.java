package fr.cgi.edt.services.impl;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Réservations RBS à libérer quand on supprime un cours ou les occurrences à venir d'une série. */
class EdtServiceBookingIdsTest {

    @Test
    void reunitLesReservationsSansDoublon() {
        JsonArray courses = new JsonArray()
                .add(new JsonObject().put("rbsBookingIds", new JsonArray().add(41).add(42)))
                .add(new JsonObject().put("rbsBookingIds", new JsonArray().add(42).add(43)));
        assertEquals(new JsonArray().add(41).add(42).add(43), EdtServiceMongoImpl.collectBookingIds(courses));
    }

    @Test
    void coursSansReservationIgnores() {
        JsonArray courses = new JsonArray()
                .add(new JsonObject())
                .add(new JsonObject().putNull("rbsBookingIds"))
                .add(new JsonObject().put("rbsBookingIds", new JsonArray()));
        assertEquals(new JsonArray(), EdtServiceMongoImpl.collectBookingIds(courses));
    }
}
