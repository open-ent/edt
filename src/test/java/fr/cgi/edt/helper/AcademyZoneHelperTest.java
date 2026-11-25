package fr.cgi.edt.helper;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public class AcademyZoneHelperTest {

    @Test
    public void normalize_matchesGraphAndDatasetSpellings() {
        Assertions.assertEquals("RENNES", AcademyZoneHelper.normalize("RENNES"));
        Assertions.assertEquals("RENNES", AcademyZoneHelper.normalize("Rennes"));
        Assertions.assertEquals("BESANCON", AcademyZoneHelper.normalize("Besançon"));
        Assertions.assertEquals("BESANCON", AcademyZoneHelper.normalize("ACADEMIE DE BESANCON"));
        Assertions.assertEquals("ORLEANS TOURS", AcademyZoneHelper.normalize("Académie d'Orléans-Tours"));
        Assertions.assertEquals("REUNION", AcademyZoneHelper.normalize("Académie de La Réunion"));
        Assertions.assertEquals("NOUVELLE CALEDONIE", AcademyZoneHelper.normalize("Nouvelle Calédonie"));
        Assertions.assertEquals("SAINT PIERRE ET MIQUELON", AcademyZoneHelper.normalize("Saint-Pierre-et-Miquelon"));
    }

    @Test
    public void normalize_mapsMergedAcademies() {
        Assertions.assertEquals("NORMANDIE", AcademyZoneHelper.normalize("CAEN"));
        Assertions.assertEquals("NORMANDIE", AcademyZoneHelper.normalize("Rouen"));
    }

    @Test
    public void normalize_emptyValues() {
        Assertions.assertNull(AcademyZoneHelper.normalize(null));
        Assertions.assertNull(AcademyZoneHelper.normalize("  "));
    }

    @Test
    public void academyFromLocation_prefersZipCode() {
        Assertions.assertEquals("Rennes", AcademyZoneHelper.academyFromLocation("29600", "0801426R"));
        Assertions.assertEquals("Amiens", AcademyZoneHelper.academyFromLocation(null, "0801426R"));
        Assertions.assertEquals("Montpellier", AcademyZoneHelper.academyFromLocation("", "0300947S"));
    }

    @Test
    public void academyFromLocation_overseasAndCorsica() {
        Assertions.assertEquals("Réunion", AcademyZoneHelper.academyFromLocation("97400", null));
        Assertions.assertEquals("Nouvelle Calédonie", AcademyZoneHelper.academyFromLocation("98800", null));
        Assertions.assertEquals("Corse", AcademyZoneHelper.academyFromLocation("20000", null));
        Assertions.assertEquals("Corse", AcademyZoneHelper.academyFromLocation(null, "7200009X"));
        Assertions.assertEquals("Guadeloupe", AcademyZoneHelper.academyFromLocation(null, "9710001A"));
    }

    @Test
    public void academyFromLocation_unknown() {
        Assertions.assertNull(AcademyZoneHelper.academyFromLocation(null, null));
        Assertions.assertNull(AcademyZoneHelper.academyFromLocation("ABCDE", "XYZ"));
    }
}
