package fr.cgi.edt.services.impl;

import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.codec.BodyCodec;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Relais vers school-planner (process Quarkus séparé, pas d'event bus partagé avec EDT — à
 * la différence de RBS, cf. RbsBridgeService) : résout la catégorie de salle requise pour une
 * matière, en réutilisant exactement la même logique que le solveur (curriculum + association
 * établissement + repli par nom), plutôt que de la dupliquer côté front EDT.
 */
public class RoomCategoryBridgeService {

    private static final Logger log = LoggerFactory.getLogger(RoomCategoryBridgeService.class);

    private RoomCategoryBridgeService() {
        throw new IllegalStateException("Utility class");
    }

    /**
     * @param cookieHeader en-tête "Cookie" brut de la requête EDT entrante — school-planner exige
     *                     la session de l'utilisateur (cookie oneSessionId + vérification
     *                     /auth/oauth2/userinfo côté serveur, droit school-planner.view minimum) ;
     *                     sans lui, l'appel échoue systématiquement en 401. En conséquence, un
     *                     enseignant sans ce droit school-planner retombera silencieusement sur
     *                     l'heuristique locale côté front (échec → promise.fail, jamais bloquant).
     */
    public static Future<JsonObject> resolveCategoryForSubject(Vertx vertx, String schoolPlannerUrl,
                                                                String structureId, String subjectName,
                                                                String subjectCode, String cookieHeader) {
        Promise<JsonObject> promise = Promise.promise();
        String url = schoolPlannerUrl + "/school-planner/api/room-category/" + structureId + "/resolve"
                + "?subjectName=" + encode(subjectName)
                + "&subjectCode=" + encode(subjectCode);
        WebClient.create(vertx)
                .getAbs(url)
                .putHeader("Cookie", cookieHeader != null ? cookieHeader : "")
                .as(BodyCodec.jsonObject())
                .send(ar -> {
                    if (ar.succeeded() && ar.result().statusCode() == 200) {
                        promise.complete(ar.result().body());
                    } else {
                        log.error("[Edt@RoomCategoryBridgeService::resolveCategoryForSubject] " +
                                "Failed to reach school-planner: " +
                                (ar.succeeded() ? ("HTTP " + ar.result().statusCode()) : ar.cause().getMessage()));
                        promise.fail("room.category.bridge.error");
                    }
                });
        return promise.future();
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException e) {
            // Ne se produit jamais pour UTF-8 (toujours supporté par la JVM).
            return value == null ? "" : value;
        }
    }
}
