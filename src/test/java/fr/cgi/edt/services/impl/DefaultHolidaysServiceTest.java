package fr.cgi.edt.services.impl;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Map;

public class DefaultHolidaysServiceTest {

    @Test
    public void parseAcademyZones_indexesByNormalizedAcademy() {
        JsonArray results = new JsonArray()
                .add(new JsonObject().put("location", "Rennes").put("zones", "Zone B"))
                .add(new JsonObject().put("location", "Besançon").put("zones", "Zone A"))
                .add(new JsonObject().put("location", "Corse").put("zones", "Corse"))
                .add(new JsonObject().put("location", "Nulle part").put("zones", "Zone Z"))
                .add(new JsonObject().put("zones", "Zone C"));

        Map<String, JsonObject> table = DefaultHolidaysService.parseAcademyZones(results);

        Assertions.assertEquals(3, table.size());
        Assertions.assertEquals("Zone B", table.get("RENNES").getString("zone"));
        Assertions.assertEquals("Besançon", table.get("BESANCON").getString("academy"));
        Assertions.assertEquals("Corse", table.get("CORSE").getString("zone"));
        Assertions.assertNull(table.get("NULLE PART"));
    }

    @Test
    public void isValidZone_usesZoneEnum() {
        Assertions.assertTrue(DefaultHolidaysService.isValidZone("Zone A"));
        Assertions.assertTrue(DefaultHolidaysService.isValidZone("Nouvelle Calédonie"));
        Assertions.assertFalse(DefaultHolidaysService.isValidZone("zone a"));
        Assertions.assertFalse(DefaultHolidaysService.isValidZone(null));
    }
}
