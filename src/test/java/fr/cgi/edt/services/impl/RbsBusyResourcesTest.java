package fr.cgi.edt.services.impl;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Ressources occupées sur un créneau : réservées par un autre, ou salle d'un autre cours. */
class RbsBusyResourcesTest {

    private final JsonArray resources = new JsonArray()
            .add(new JsonObject().put("id", 12).put("name", "Salle 201"))
            .add(new JsonObject().put("id", 15).put("name", "Salle 105"))
            .add(new JsonObject().put("id", 20).put("name", "Gymnase"));

    @Test
    void reserveeOuSalleDUnAutreCours() {
        JsonArray bookings = new JsonArray().add(new JsonObject().put("id", 4093).put("resource_id", 12));
        assertEquals(new JsonArray().add(12).add(15),
                RbsBridgeService.busyResourceIds(resources, bookings, new JsonArray(), Collections.singletonList(" salle 105 ")));
    }

    @Test
    void sesPropresReservationsNeComptentPas() {
        JsonArray bookings = new JsonArray()
                .add(new JsonObject().put("id", 4093).put("resource_id", 12))
                .add(new JsonObject().put("id", 4094).put("resource_id", 20));
        assertEquals(new JsonArray().add(20),
                RbsBridgeService.busyResourceIds(resources, bookings, new JsonArray().add(4093), Arrays.asList("", "Salle 999")));
    }
}
