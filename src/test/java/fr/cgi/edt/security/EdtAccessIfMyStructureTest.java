package fr.cgi.edt.security;

import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.user.DefaultFunctions;
import org.entcore.common.user.UserInfos;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EdtAccessIfMyStructureTest {

    private static final String COLLEGE_A = "college-a";
    private static final String LYCEE_B = "lycee-b";

    private Boolean authorize(String structureId, UserInfos user) {
        final HttpServerRequest request = mock(HttpServerRequest.class);
        when(request.getParam("structureId")).thenReturn(structureId);
        final AtomicReference<Boolean> result = new AtomicReference<>();
        new EdtAccessIfMyStructure().authorize(request, null, user, result::set);
        return result.get();
    }

    private UserInfos user(String... structures) {
        final UserInfos user = new UserInfos();
        user.setStructures(Arrays.asList(structures));
        return user;
    }

    private UserInfos withFunction(UserInfos user, String code, String... scope) {
        final UserInfos.Function function = new UserInfos.Function();
        function.setScope(Arrays.asList(scope));
        final Map<String, UserInfos.Function> functions = new HashMap<>();
        functions.put(code, function);
        user.setFunctions(functions);
        return user;
    }

    @Test
    void usagerRattacheAutorise() {
        assertEquals(true, authorize(COLLEGE_A, user(COLLEGE_A)));
    }

    @Test
    void usagerDUnAutreEtablissementRefuse() {
        assertEquals(false, authorize(LYCEE_B, user(COLLEGE_A)));
    }

    @Test
    void fonctionDontLePerimetreCouvreLEtablissementAutorisee() {
        // Ex. ADML du Lycée B rattaché au seul Collège A.
        assertEquals(true, authorize(LYCEE_B, withFunction(user(COLLEGE_A), DefaultFunctions.ADMIN_LOCAL, LYCEE_B)));
    }

    @Test
    void fonctionHorsPerimetreRefusee() {
        assertEquals(false, authorize(LYCEE_B, withFunction(user(COLLEGE_A), DefaultFunctions.ADMIN_LOCAL, COLLEGE_A)));
    }

    @Test
    void superAdminAutoriseSansRattachement() {
        assertEquals(true, authorize(LYCEE_B, withFunction(user(), DefaultFunctions.SUPER_ADMIN)));
    }

    @Test
    void etablissementAbsentRefuse() {
        assertEquals(false, authorize(null, user(COLLEGE_A)));
        assertEquals(false, authorize("", user(COLLEGE_A)));
    }

    @Test
    void usagerSansStructureNiFonctionRefuse() {
        final UserInfos user = new UserInfos();
        user.setStructures(Collections.emptyList());
        assertEquals(false, authorize(COLLEGE_A, user));
    }
}
