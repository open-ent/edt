package fr.cgi.edt.controllers;


import fr.cgi.edt.services.CourseService;
import fr.cgi.edt.services.impl.DefaultCourseService;
import fr.wseduc.rs.*;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.user.UserUtils;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Vert.x backend controller for the application using Mongodb.
 */
public class CourseController extends ControllerHelper {

    private final CourseService courseService;

    public CourseController(EventBus eb, CourseService courseService) {
        this.courseService = courseService;
    }

    @Post("/structures/:structureId/common/courses/:startAt/:endAt")
    @ApiDoc("get courses")
    public void getCourses(final HttpServerRequest request) {
        RequestUtils.bodyToJson(request, event -> {
            final String structureId = request.getParam("structureId");
            final String startAt = request.getParam("startAt");
            final String endAt = request.getParam("endAt");
            final JsonArray teacherIds = event.getJsonArray("teacherIds");
            final JsonArray groupIds = event.getJsonArray("groupIds");
            final JsonArray groupExternalIds = new JsonArray(event.getJsonArray("groupExternalIds").stream()
                    .filter(Objects::nonNull).collect(Collectors.toList()));
            final JsonArray groupNames = event.getJsonArray("groupNames");
            final String startTime = event.getString("startTime");
            final String endTime = event.getString("endTime");
            final Boolean union = event.getBoolean("union");
            final Boolean crossDateFilter = event.getBoolean("crossDateFilter");

            UserUtils.getUserInfos(eb, request, user -> courseService.getCourses(structureId, startAt, endAt, teacherIds, groupIds, groupExternalIds, groupNames,
                            startTime, endTime, union, crossDateFilter, user)
                    .onSuccess(result -> renderJson(request, result))
                    .onFailure(err -> badRequest(request)));
        });
    }

    // Pas de filtre par salle natif côté EDT (Mongo) : on récupère tous les cours de la
    // structure sur la période (filtres enseignant/groupe vides -> aucune restriction, cf.
    // DefaultCommonCoursService#listCoursesBetweenTwoDates) puis on filtre ici par roomLabels.
    // Consommé par RBS pour avertir d'un conflit avec l'emploi du temps avant une réservation.
    @Get("/structures/:structureId/room-conflicts/:startAt/:endAt")
    @ApiDoc("Cours EDT existants dans une salle donnée sur une période (détection de conflit avant une réservation RBS).")
    public void getRoomConflicts(final HttpServerRequest request) {
        final String structureId = request.getParam("structureId");
        final String startAt = request.getParam("startAt");
        final String endAt = request.getParam("endAt");
        final String room = request.params().get("room");

        if (room == null || room.trim().isEmpty()) {
            renderJson(request, new JsonArray());
            return;
        }

        // L'appel interne (bus vie-scolaire, EventBusController#courseBusService) exige un format
        // strict YYYY-MM-DD — startAt/endAt reçus ici sont des datetimes ISO complets (le créneau
        // horaire précis de la réservation), on ne garde que la date pour cet appel et on filtre
        // le chevauchement horaire nous-mêmes ci-dessous.
        final String startDateOnly = startAt.length() >= 10 ? startAt.substring(0, 10) : startAt;
        final String endDateOnly = endAt.length() >= 10 ? endAt.substring(0, 10) : endAt;
        final Date requestedStart = parseIsoDateTime(startAt);
        final Date requestedEnd = parseIsoDateTime(endAt);

        courseService.getCourses(structureId, startDateOnly, endDateOnly, new JsonArray(), new JsonArray(), new JsonArray(),
                        new JsonArray(), null, null, true, false, null)
                .onSuccess(courses -> {
                    JsonArray matching = new JsonArray();
                    for (Object o : courses) {
                        JsonObject course = (JsonObject) o;
                        JsonArray roomLabels = course.getJsonArray("roomLabels", new JsonArray());
                        boolean matchesRoom = roomLabels.stream()
                                .anyMatch(r -> room.trim().equalsIgnoreCase(String.valueOf(r).trim()));
                        if (matchesRoom && overlaps(course, requestedStart, requestedEnd)) {
                            matching.add(course);
                        }
                    }
                    renderJson(request, matching);
                })
                .onFailure(err -> badRequest(request));
    }

    private static Date parseIsoDateTime(String value) {
        try {
            return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").parse(value);
        } catch (ParseException e) {
            return null;
        }
    }

    private static Date parseCourseDate(String value) {
        try {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").parse(value);
        } catch (ParseException | NullPointerException e) {
            return null;
        }
    }

    private static boolean overlaps(JsonObject course, Date requestedStart, Date requestedEnd) {
        if (requestedStart == null || requestedEnd == null) {
            return true; // dates non fournies/invalides : on ne filtre pas, on garde tout (comportement précédent)
        }
        Date courseStart = parseCourseDate(course.getString("startDate"));
        Date courseEnd = parseCourseDate(course.getString("endDate"));
        if (courseStart == null || courseEnd == null) {
            return true;
        }
        return courseStart.before(requestedEnd) && courseEnd.after(requestedStart);
    }
}
