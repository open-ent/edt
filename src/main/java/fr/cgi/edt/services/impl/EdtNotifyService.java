package fr.cgi.edt.services.impl;

import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.http.Renders;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.notification.TimelineHelper;
import org.entcore.common.user.UserInfos;

import java.util.ArrayList;
import java.util.List;

/**
 * Émet une notification timeline (+ push mobile) aux élèves et à leurs responsables
 * des classes d'un cours lors d'une création / modification / suppression.
 *
 * Le template est view/notify/course-changed.html, la notification « edt.course-changed »
 * est auto-enregistrée par le module timeline au démarrage (comme presences.event-creation).
 */
public class EdtNotifyService {

    private static final Logger log = LoggerFactory.getLogger(EdtNotifyService.class);
    private static final String NOTIF_NAME = "edt.course-changed";

    private final TimelineHelper timeline;
    private final Neo4j neo4j;

    public EdtNotifyService(TimelineHelper timeline, Neo4j neo4j) {
        this.timeline = timeline;
        this.neo4j = neo4j;
    }

    /** action ∈ { created, updated, deleted } */
    public void notifyCourseChange(HttpServerRequest request, UserInfos user, JsonObject course, String action) {
        if (course == null || user == null) return;
        final String structureId = course.getString("structureId");
        final JsonArray classes = course.getJsonArray("classes", new JsonArray());
        if (structureId == null || classes == null || classes.isEmpty()) return;

        final String query =
                "MATCH (s:Structure {id:{structureId}})<-[:BELONGS]-(c:Class)<-[:DEPENDS]-(:ProfileGroup)<-[:IN]-(u:User) " +
                "WHERE c.name IN {classes} AND 'Student' IN u.profiles " +
                "OPTIONAL MATCH (u)-[:RELATED]-(r:User) WHERE 'Relative' IN r.profiles " +
                "RETURN collect(DISTINCT u.id) + collect(DISTINCT r.id) AS ids";
        final JsonObject params = new JsonObject().put("structureId", structureId).put("classes", classes);

        neo4j.execute(query, params, res -> {
            final JsonObject body = res.body();
            if (!"ok".equals(body.getString("status"))) {
                log.error("[EdtNotifyService] recipients query failed: " + body.getString("message"));
                return;
            }
            final JsonArray rows = body.getJsonArray("result", new JsonArray());
            final List<String> recipients = new ArrayList<>();
            if (!rows.isEmpty()) {
                final JsonArray ids = rows.getJsonObject(0).getJsonArray("ids", new JsonArray());
                for (Object o : ids) if (o != null) recipients.add(o.toString());
            }
            recipients.remove(user.getUserId()); // ne pas se notifier soi-même
            if (recipients.isEmpty()) return;

            final String lang = I18n.acceptLanguage(request);
            final String host = Renders.getHost(request);
            final String actionLabel = I18n.getInstance().translate("edt.course.action." + action, host, lang);
            final JsonObject subject = course.getJsonObject("subject", new JsonObject());
            final String subjectName = subject.getString("name", course.getString("subjectId", ""));

            final JsonObject notifyParams = new JsonObject()
                    .put("senderName", user.getUsername())
                    .put("actionLabel", actionLabel)
                    .put("subject", subjectName)
                    .put("classes", joinClasses(classes))
                    .put("date", formatDate(course.getString("startDate")))
                    .put("resourceUri", "/edt")
                    .put("pushNotif", new JsonObject()
                            .put("title", "edt.push.notif.course.changed.title")
                            .put("body", actionLabel + " " + subjectName));

            try {
                timeline.notifyTimeline(request, NOTIF_NAME, user, recipients, "", notifyParams);
            } catch (Exception e) {
                log.error("[EdtNotifyService] notifyTimeline failed", e);
            }
        });
    }

    private static String joinClasses(JsonArray classes) {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < classes.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(classes.getValue(i));
        }
        return sb.toString();
    }

    /** "2026-06-15T08:00:00" -> "15/06/2026 08:00" */
    private static String formatDate(String startDate) {
        if (startDate == null) return "";
        try {
            final String d = startDate.substring(0, 10);
            final String t = startDate.length() >= 16 ? startDate.substring(11, 16) : "";
            final String[] p = d.split("-");
            return p[2] + "/" + p[1] + "/" + p[0] + (t.isEmpty() ? "" : " " + t);
        } catch (Exception e) {
            return startDate;
        }
    }
}
