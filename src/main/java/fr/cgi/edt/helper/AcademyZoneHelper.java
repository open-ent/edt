package fr.cgi.edt.helper;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.Map;

/**
 * Rapproche une structure de son académie, sous la forme que porte le jeu de données
 * data.education.gouv.fr « fr-en-calendrier-scolaire » (champ {@code location}).
 *
 * Le graphe porte l'académie sous des graphies variables ({@code RENNES}, {@code Dijon},
 * {@code ACADEMIE DE BESANCON}…), on compare donc des formes normalisées : majuscules,
 * sans accents ni ponctuation. Ex. {@code "Académie d'Orléans-Tours"} → {@code "ORLEANS TOURS"}.
 *
 * Quand l'académie manque, on la déduit du département, tiré du code postal ou de l'UAI.
 */
public final class AcademyZoneHelper {

    private static final Map<String, String> ACADEMY_BY_DEPARTMENT = new HashMap<>();
    private static final Map<String, String> ACADEMY_ALIASES = new HashMap<>();

    static {
        register("Aix-Marseille", "04", "05", "13", "84");
        register("Amiens", "02", "60", "80");
        register("Besançon", "25", "39", "70", "90");
        register("Bordeaux", "24", "33", "40", "47", "64");
        register("Clermont-Ferrand", "03", "15", "43", "63");
        register("Corse", "20", "2A", "2B");
        register("Créteil", "77", "93", "94");
        register("Dijon", "21", "58", "71", "89");
        register("Grenoble", "07", "26", "38", "73", "74");
        register("Lille", "59", "62");
        register("Limoges", "19", "23", "87");
        register("Lyon", "01", "42", "69");
        register("Montpellier", "11", "30", "34", "48", "66");
        register("Nancy-Metz", "54", "55", "57", "88");
        register("Nantes", "44", "49", "53", "72", "85");
        register("Nice", "06", "83");
        register("Normandie", "14", "27", "50", "61", "76");
        register("Orléans-Tours", "18", "28", "36", "37", "41", "45");
        register("Paris", "75");
        register("Poitiers", "16", "17", "79", "86");
        register("Reims", "08", "10", "51", "52");
        register("Rennes", "22", "29", "35", "56");
        register("Strasbourg", "67", "68");
        register("Toulouse", "09", "12", "31", "32", "46", "65", "81", "82");
        register("Versailles", "78", "91", "92", "95");
        register("Guadeloupe", "971");
        register("Martinique", "972");
        register("Guyane", "973");
        register("Réunion", "974");
        register("Saint Pierre et Miquelon", "975");
        register("Mayotte", "976");
        register("Wallis et Futuna", "986");
        register("Polynésie", "987");
        register("Nouvelle Calédonie", "988");

        // Caen et Rouen ont fusionné en 2020 dans l'académie de Normandie.
        ACADEMY_ALIASES.put("CAEN", "NORMANDIE");
        ACADEMY_ALIASES.put("ROUEN", "NORMANDIE");
        ACADEMY_ALIASES.put("POLYNESIE FRANCAISE", "POLYNESIE");
    }

    private AcademyZoneHelper() {
        throw new IllegalStateException("Helper class");
    }

    private static void register(String academy, String... departments) {
        for (String department : departments) {
            ACADEMY_BY_DEPARTMENT.put(department, academy);
        }
    }

    /**
     * Forme comparable d'un nom d'académie. Ex. {@code "Académie de La Réunion"} → {@code "REUNION"},
     * {@code "ROUEN"} → {@code "NORMANDIE"}.
     */
    public static String normalize(String academy) {
        if (academy == null) return null;
        String value = Normalizer.normalize(academy, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase()
                .replaceAll("[^A-Z0-9]+", " ")
                .trim();
        value = value.replaceFirst("^ACADEMIE (DE |D |DES |DU )?", "");
        value = value.replaceFirst("^(LA|LE|L) ", "");
        value = value.trim();
        if (value.isEmpty()) return null;
        return ACADEMY_ALIASES.getOrDefault(value, value);
    }

    /**
     * Académie déduite du département. Le code postal prime ; à défaut, l'UAI, dont les trois
     * premiers caractères codent le département (Corse : 620 → 2A, 720 → 2B).
     * Ex. code postal {@code 29600} → Rennes ; UAI {@code 0801426R} → Amiens.
     */
    public static String academyFromLocation(String zipCode, String uai) {
        String department = departmentFromZipCode(zipCode);
        if (department == null) department = departmentFromUai(uai);
        return department == null ? null : ACADEMY_BY_DEPARTMENT.get(department);
    }

    static String departmentFromZipCode(String zipCode) {
        if (zipCode == null) return null;
        String zip = zipCode.trim();
        if (!zip.matches("\\d{5}")) return null;
        if (zip.startsWith("97") || zip.startsWith("98")) return zip.substring(0, 3);
        if (zip.startsWith("20")) return Integer.parseInt(zip) < 20200 ? "2A" : "2B";
        return zip.substring(0, 2);
    }

    static String departmentFromUai(String uai) {
        if (uai == null || uai.length() < 3) return null;
        String prefix = uai.substring(0, 3);
        if ("620".equals(prefix)) return "2A";
        if ("720".equals(prefix)) return "2B";
        if (!prefix.matches("\\d{3}")) return null;
        if (prefix.startsWith("97") || prefix.startsWith("98")) return prefix;
        return prefix.startsWith("0") ? prefix.substring(1) : null;
    }
}
