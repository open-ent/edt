package fr.cgi.edt.utils;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.TimeZone;

/** Les dates du calendrier scolaire se lisent à l'heure de Paris, même sur une JVM en UTC (production). */
public class DateHelperParisDayTest {

    private final TimeZone initial = TimeZone.getDefault();

    @AfterEach
    void restore() {
        TimeZone.setDefault(initial);
    }

    @Test
    void toParisDay_ignoresJvmTimezone() {
        for (String tz : new String[]{"UTC", "Europe/Paris", "America/New_York"}) {
            TimeZone.setDefault(TimeZone.getTimeZone(tz));
            Assertions.assertEquals("2026-12-19", DateHelper.toParisDay("2026-12-18T23:00:00+00:00"), tz);
            // heure d'été : minuit à Paris = 22 h UTC la veille
            Assertions.assertEquals("2027-07-03", DateHelper.toParisDay("2027-07-02T22:00:00+00:00"), tz);
        }
    }

    @Test
    void toParisDay_invalid() {
        Assertions.assertNull(DateHelper.toParisDay(null));
        Assertions.assertNull(DateHelper.toParisDay("pas une date"));
    }
}
