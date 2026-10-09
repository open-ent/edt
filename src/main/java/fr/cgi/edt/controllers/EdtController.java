package fr.cgi.edt.controllers;

import fr.cgi.edt.core.constants.EventStores;
import fr.cgi.edt.core.constants.Field;
import fr.cgi.edt.security.UserInStructure;
import fr.cgi.edt.security.WorkflowActionUtils;
import fr.cgi.edt.security.workflow.ManageCourseWorkflowAction;
import fr.cgi.edt.security.workflow.ManageSettingsWorkflowAction;
import fr.cgi.edt.services.EdtService;
import fr.cgi.edt.services.StructureService;
import fr.cgi.edt.services.StsService;
import fr.cgi.edt.services.UserService;
import fr.cgi.edt.services.impl.EdtNotifyService;
import fr.cgi.edt.services.impl.EdtServiceMongoImpl;
import fr.cgi.edt.services.impl.RbsBridgeService;
import fr.cgi.edt.services.impl.RoomCategoryBridgeService;
import fr.cgi.edt.services.impl.StructureServiceNeo4jImpl;
import fr.cgi.edt.services.impl.StsServiceMongoImpl;
import fr.cgi.edt.services.impl.UserServiceNeo4jImpl;
import fr.cgi.edt.sts.StsDAO;
import fr.cgi.edt.sts.StsImport;
import fr.cgi.edt.sts.bean.Report;
import fr.wseduc.mongodb.MongoDb;
import fr.wseduc.rs.*;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.events.EventStore;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.filter.Trace;
import org.entcore.common.mongodb.MongoDbControllerHelper;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.notification.TimelineHelper;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;
import org.vertx.java.core.http.RouteMatcher;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.entcore.common.http.response.DefaultResponseHandler.*;

/**
 * Vert.x backend controller for the application using Mongodb.
 */
public class EdtController extends MongoDbControllerHelper {

    private final EdtService edtService;
    private final UserService userService;
    private StructureService structureService = new StructureServiceNeo4jImpl();
    private StsService stsService = new StsServiceMongoImpl();
    private static final Logger LOGGER = LoggerFactory.getLogger(EdtServiceMongoImpl.class);
    private final EventStore eventStore;
    private EdtNotifyService notifyService;

    /** Clé de préférence usager portant le choix d'IHM et l'état des bandeaux qui le proposent.
     *  Ex. {"ui":"react","invitationShown":3} — lue par preferredUi(), écrite par public/ui-switch.js,
     *  par le bandeau React et par les paramètres du compte du dashboard. */
    private static final String UI_PREFERENCE = "edtUi";



    private static final String
            read_only = "edt.view",
            modify = "edt.manage";

    /**
     * Creates a new controller.
     *
     * @param collection Name of the collection stored in the mongoDB database.
     */
    public EdtController(String collection, EventBus eb, EventStore eventStore) {
        super(collection);
        edtService = new EdtServiceMongoImpl(collection, eb);
        userService = new UserServiceNeo4jImpl();
        this.eventStore = eventStore;
    }

    @Override
    public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
                     Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
        super.init(vertx, config, rm, securedActions);
        this.notifyService = new EdtNotifyService(new TimelineHelper(vertx, vertx.eventBus(), config), Neo4j.getInstance());
    }

    /**
     * Displays the home view.
     * @param request Client request
     */
    @Get("")
    @SecuredAction(read_only)
    public void view(HttpServerRequest request) {
        // Choix de l'IHM (CCTP 51C — migration React), par ordre de priorité décroissante :
        //   1. `?ui=react|angular` — dérogation ponctuelle, NON mémorisée (vérification, support) ;
        //   2. la préférence de l'usager (clé `edtUi`), posée par les bandeaux de bascule ou par
        //      les paramètres du compte dans le dashboard ;
        //   3. la conf `frontend-ui` du bloc edt dans ent-core.yaml (variable EDT_FRONTEND_UI).
        // Ex. usager ayant choisi « Nouvelle version » : /edt → edt-react.html ; /edt?ui=angular → edt.html.
        final String uiParam = request.params().get("ui");
        final String forcedUi = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : null;

        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            preferredUi(user.getUserId(), forcedUi).onSuccess(ui -> {
                if ("react".equals(ui)) {
                    renderView(request, new JsonObject(), "edt-react.html", null);
                } else {
                    renderView(request);
                }
                this.eventStore.createAndStoreEvent(EventStores.ACCESS, request);
            });
        });
    }

    /**
     * IHM à servir : la dérogation d'URL si elle est présente, sinon le choix mémorisé par
     * l'usager, sinon celui de la plateforme.
     *
     * Le choix est lu à sa source, le nœud {@code UserAppConf} du graphe (celui qu'écrit
     * {@code PUT /userbook/preference/edtUi}) : ni la session ni le bus {@code userbook.preferences}
     * ne restituent une clé écrite pendant la session en cours (constat fait sur l'agenda).
     * Ex. préférence stockée {@code uac.edtUi = "{\"ui\":\"react\",\"invitationShown\":2}"} → "react".
     *
     * ⚠ Clé sans tiret ni point : entcore retire les caractères non alphanumériques avant d'en faire
     * un nom de propriété Cypher (ex. {@code presences.register} est rangé en {@code uac.presencesregister}).
     *
     * Aucune panne de cette lecture ne doit empêcher l'emploi du temps de s'afficher : à la moindre
     * difficulté, la plateforme tranche.
     */
    private Future<String> preferredUi(String userId, String forcedUi) {
        if (forcedUi != null) return Future.succeededFuture(forcedUi);

        final Promise<String> promise = Promise.promise();
        final String query = "MATCH (:User {id:{userId}})-[:PREFERS]->(uac:UserAppConf) " +
                "RETURN uac." + UI_PREFERENCE + " AS preference";
        Neo4j.getInstance().execute(query, new JsonObject().put("userId", userId),
                message -> promise.complete(readUi(message.body())));
        return promise.future();
    }

    /** Extrait le choix d'IHM du résultat Neo4j — la préférence y est rangée en CHAÎNE JSON. */
    private String readUi(JsonObject body) {
        try {
            final JsonArray rows = body.getJsonArray("result", new JsonArray());
            if (rows.isEmpty()) return platformUi();
            final String raw = rows.getJsonObject(0).getString("preference");
            if (raw == null || raw.trim().isEmpty()) return platformUi();
            final String ui = new JsonObject(raw).getString("ui");
            return ("react".equals(ui) || "angular".equals(ui)) ? ui : platformUi();
        } catch (Exception e) {
            // Préférence illisible (écriture partielle, ancien format) ou graphe en échec :
            // la plateforme tranche. Jamais d'erreur 500 pour un choix d'habillage.
            LOGGER.warn("[Edt@readUi] préférence " + UI_PREFERENCE + " illisible", e);
            return platformUi();
        }
    }

    /** IHM de la plateforme quand l'usager n'a rien choisi ; repli "angular", dont la parité est acquise. */
    private String platformUi() {
        return "react".equals(config.getString("frontend-ui", "angular")) ? "react" : "angular";
    }

    private Handler<Either<String, JsonObject>> getServiceHandler (final HttpServerRequest request) {
        return new Handler<Either<String, JsonObject>>() {
            @Override
            public void handle(Either<String, JsonObject> result) {
                if (result.isRight()) {
                    renderJson(request, result.right().getValue());
                } else {
                    renderError(request);
                }
            }
        };
    }

    @Post("/course")
    @SecuredAction(modify)
    @Trace("POST_COURSE")
    @ApiDoc("Create a course with 1 or more occurrences")
    public void create(final HttpServerRequest request) {
        RequestUtils.bodyToJsonArray(request, body ->
            UserUtils.getUserInfos(eb, request, user ->
                edtService.create(body, result -> {
                    if (result.isRight()) {
                        JsonObject responseBody = result.right().getValue();
                        if (user != null) {
                            RbsBridgeService.syncBookings(eb, body, user.getUserId()).onComplete(ar -> {
                                JsonArray rbsConflicts = ar.succeeded() ? ar.result() : new JsonArray();
                                if (!rbsConflicts.isEmpty()) responseBody.put("rbsConflicts", rbsConflicts);
                                renderJson(request, responseBody);
                                if (notifyService != null && !body.isEmpty())
                                    notifyService.notifyCourseChange(request, user, body.getJsonObject(0), "created");
                            });
                        } else {
                            renderJson(request, responseBody);
                        }
                    } else {
                        renderError(request);
                    }
                })
            )
        );
    }

    @Put("/course")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @Trace("PUT_COURSE")
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @ApiDoc("Update course")
    public void update(final HttpServerRequest request) {
        RequestUtils.bodyToJsonArray(request, body ->
            UserUtils.getUserInfos(eb, request, user -> {
                JsonArray courseIds = new JsonArray();
                for (int i = 0; i < body.size(); i++) {
                    String id = body.getJsonObject(i).getString(Field._ID);
                    if (id != null) courseIds.add(id);
                }
                // Récupère les anciennes rbsBookingIds AVANT écrasement : elles seront supprimées
                // après la mise à jour, remplacées par celles créées par le syncBookings suivant
                // (stratégie simple "tout supprimer / tout recréer", pas de diff fin).
                MongoDb.getInstance().find(fr.cgi.edt.Edt.EDT_COLLECTION,
                    new JsonObject().put(Field._ID, new JsonObject().put("$in", courseIds)),
                    oldCoursesMsg -> {
                        JsonArray oldBookingIds = new JsonArray();
                        if ("ok".equals(oldCoursesMsg.body().getString("status"))) {
                            JsonArray oldCourses = oldCoursesMsg.body().getJsonArray("results", new JsonArray());
                            for (int i = 0; i < oldCourses.size(); i++) {
                                JsonArray ids = oldCourses.getJsonObject(i).getJsonArray(Field.RBS_BOOKING_IDS);
                                if (ids != null) oldBookingIds.addAll(ids);
                            }
                        }

                        edtService.update(body, result -> {
                            if (result.isRight()) {
                                JsonObject responseBody = result.right().getValue();
                                if (user != null) {
                                    // Anciennes réservations supprimées AVANT de recréer les nouvelles :
                                    // sinon un cours allongé dans la même salle bute sur sa propre réservation.
                                    RbsBridgeService.deleteBookingsThen(eb, oldBookingIds, user.getUserId())
                                        .compose(v -> RbsBridgeService.syncBookings(eb, body, user.getUserId()))
                                        .onComplete(ar -> {
                                        JsonArray rbsConflicts = ar.succeeded() ? ar.result() : new JsonArray();
                                        if (!rbsConflicts.isEmpty()) responseBody.put("rbsConflicts", rbsConflicts);
                                        renderJson(request, responseBody);
                                        if (notifyService != null && !body.isEmpty())
                                            notifyService.notifyCourseChange(request, user, body.getJsonObject(0), "updated");
                                    });
                                } else {
                                    renderJson(request, responseBody);
                                }
                            } else {
                                renderError(request);
                            }
                        });
                    });
            })
        );
    }

    @Put("/courses/tag")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @Trace("PUT_COURSE")
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @SuppressWarnings("unchecked")
    @ApiDoc("Update courses tags")
    public void updateCoursesTag(final HttpServerRequest request) {

        RequestUtils.bodyToJson(request, body -> {
            Integer tagId = body.getInteger(Field.TAGID);
            List<String> courseIds = body.getJsonArray(Field.COURSEIDS).getList();
            edtService.updateCoursesTag(courseIds, tagId)
                    .onFailure(fail -> renderError(request))
                    .onSuccess(res -> renderJson(request, res));
        });
    }

    @Put("/occurrence/:timestamp")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @Trace("PUT_OCCURRENCE")
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @ApiDoc("Update course occurrence")
    public void updateOccurrence (final HttpServerRequest request) {
        RequestUtils.bodyToJsonArray(request, (body) -> {
            String dateOccurrence = request.getParam("timestamp");
            edtService.updateOccurrence(body.getJsonObject(0), dateOccurrence, getServiceHandler(request));
        });
    }

    @Get("/user/children")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    @ApiDoc("Return information needs by relative profiles")
    public void getChildrenInformation(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> userService.getChildrenInformation(user, arrayResponseHandler(request)));
    }

    @Get("/structures/:id/rbs/resources")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    @ApiDoc("Liste les types/ressources RBS d'une structure, sans exiger de droit RBS " +
            "(relais serveur — n'importe quel enseignant doit pouvoir choisir une salle).")
    public void getRbsResources(final HttpServerRequest request) {
        String structureId = request.params().get("id");
        RbsBridgeService.listResourcesForStructure(eb, structureId)
                .onSuccess(res -> renderJson(request, res))
                .onFailure(err -> renderError(request));
    }

    @Get("/structures/:id/room-category")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    @ApiDoc("Relais vers school-planner : résout la catégorie de salle requise pour une matière " +
            "(subjectName/subjectCode en query), pour la mettre en avant en saisie manuelle de " +
            "salle — même logique que le solveur, pas de duplication de l'heuristique côté front.")
    public void getRoomCategory(final HttpServerRequest request) {
        String structureId = request.params().get("id");
        String subjectName = request.params().get("subjectName");
        String subjectCode = request.params().get("subjectCode");
        String schoolPlannerUrl = config.getString(Field.SCHOOL_PLANNER_URL, "http://localhost:8084");
        String cookieHeader = request.getHeader("Cookie");
        RoomCategoryBridgeService.resolveCategoryForSubject(vertx, schoolPlannerUrl, structureId, subjectName, subjectCode, cookieHeader)
                .onSuccess(res -> renderJson(request, res))
                .onFailure(err -> renderJson(request, new JsonObject().putNull("category")));
    }

    @Delete("/course/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @Trace("DELETE_COURSE")
    @ResourceFilter(ManageSettingsWorkflowAction.class)
    @ApiDoc("Delete a course")
    public void delete (final HttpServerRequest request) {
        try {
            final String id = request.params().get("id");
            // On récupère le cours AVANT suppression (classes/matière) pour notifier les élèves.
            UserUtils.getUserInfos(eb, request, user ->
                MongoDb.getInstance().findOne(fr.cgi.edt.Edt.EDT_COLLECTION, new JsonObject().put("_id", id), msg -> {
                    final JsonObject course = "ok".equals(msg.body().getString("status"))
                            ? msg.body().getJsonObject("result") : null;
                    edtService.delete(id, res -> {
                        if (res.isRight()) {
                            renderJson(request, res.right().getValue());
                            if (notifyService != null && course != null)
                                notifyService.notifyCourseChange(request, user, course, "deleted");
                            JsonArray bookingIds = course != null ? course.getJsonArray(Field.RBS_BOOKING_IDS) : null;
                            if (bookingIds != null && !bookingIds.isEmpty())
                                RbsBridgeService.deleteBookings(eb, bookingIds, user != null ? user.getUserId() : null);
                        } else {
                            renderError(request);
                        }
                    });
                }));
        } catch (ClassCastException e) {
            LOGGER.error("[EdtController::delete] bad request", e);
            badRequest(request);
        }
    }

    @Delete("/occurrence/:timestamp/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @Trace("DELETE_OCCURRENCE")
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @ApiDoc("delete course occurrence")
    public void deleteOccurrence (final HttpServerRequest request) {
        String dateOccurrence = request.getParam("timestamp");
        String id = request.params().get("id");
        edtService.deleteOccurrence(id,dateOccurrence, notEmptyResponseHandler(request));
    }

    @Get("/time-slots")
    @SecuredAction(value = WorkflowActionUtils.TIME_SLOTS_READ, type = ActionType.WORKFLOW)
    public void getSlots(final HttpServerRequest request) {
        if (!request.params().contains("structureId")){
            badRequest(request);
        }
        String structureId = request.getParam("structureId");
        JsonObject action = new JsonObject()
                .put("action", "timeslot.getSlotProfiles")
                .put("structureId", structureId);

        eb.request("viescolaire", action, event -> {
            JsonObject body = (JsonObject) event.result().body();
            if (event.failed() || "error".equals(body.getString("status"))) {
                log.error("[EDT@EdtController::getSlots] Failed to fetch time slots via viescolaire event bus");
                renderError(request);
            } else {
                Renders.renderJson(request, body.getJsonObject("result").getJsonArray("slots", new JsonArray()));
            }
        });
    }

    @Post("/structures/:id/sts")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(UserInStructure.class)
    @Trace(value = "POST_STS", body = false)
    @ApiDoc("Import sts file")
    public void importSts(final HttpServerRequest request) {
        String structure = request.getParam("id");
        StsDAO dao = new StsDAO(Neo4j.getInstance(), MongoDb.getInstance());
        StsImport stsImport = new StsImport(vertx, dao);
        stsImport.setRequestStructure(structure);
        final String importId = UUID.randomUUID().toString();
        final String path = config.getString("import-folder", "/tmp") + File.separator + importId;
        stsImport.upload(request, path, event -> {
            if (event.succeeded()) {
                stsImport.importFiles(path, ar -> {
                    if (ar.failed()) {
                        renderError(request, new JsonObject().put("error", ar.cause().getMessage()));
                        return;
                    }

                    Report report = ar.result();
                    report.generate(rep -> {
                        if (rep.failed()) {
                            renderError(request, new JsonObject().put("error", rep.cause().getMessage()));
                            return;
                        }

                        renderJson(request, new JsonObject().put("report", rep.result()));
                        report.save(s -> {
                            if (s.failed()) log.error("Failed to save sts report " + importId);
                        });
                    });
                });
            } else
                renderError(request, new JsonObject().put("error", event.cause().getMessage()));
        });
    }

    @Get("/structures/:id/sts/reports")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(UserInStructure.class)
    @ApiDoc("Retrieve STS import report based on given structure")
    public void report(HttpServerRequest request) {
        String id = request.getParam("id");
        structureService.retrieveUAI(id, evt -> {
            if (evt.isLeft()) {
                renderError(request);
                return;
            }

            String uai = evt.right().getValue();

            stsService.reports(uai, arrayResponseHandler(request));
        });
    }

    @Get("/courses/recurrences/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    public void getRecurrences(HttpServerRequest request) {
        String recurrence = request.getParam(Field.ID).replace(Field.URL_SPACE, Field.SPACE);
        edtService.retrieveRecurrences(recurrence, arrayResponseHandler(request));
    }

    @Get("/courses/recurrences/dates/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    public void getRecurrencesDates(HttpServerRequest request) {
        String recurrence = request.getParam(Field.ID).replace(Field.URL_SPACE, Field.SPACE);
        edtService.retrieveRecurrencesDates(recurrence)
                .onFailure(err -> badRequest(request))
                .onSuccess(result -> renderJson(request, result));
    }

    @Get("/courses/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    public void getCourse(HttpServerRequest request) {
        String id = request.getParam(Field.ID);
        edtService.getCourse(id, defaultResponseHandler(request));
    }

    @Put("/courses/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @Trace("PUT_COURSE")
    public void updateCourse(HttpServerRequest request) {
        String id = request.getParam("id");
        RequestUtils.bodyToJson(request, course -> edtService.updateCourse(id, course, defaultResponseHandler(request)));
    }

    @Put("/courses/recurrences/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @Trace("PUT_RECURRENCE")
    public void updateRecurrence(HttpServerRequest request) {
        String id = request.getParam("id");
        RequestUtils.bodyToJson(request, course -> edtService.updateRecurrence(id, course, arrayResponseHandler(request)));
    }

    @Delete("/courses/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @Trace("DELETE_COURSE")
    public void deleteCourse(HttpServerRequest request) {
        String id = request.getParam("id");
        UserUtils.getUserInfos(eb, request, user -> edtService.deleteCourse(id, releaseBookingsThen(request, user)));
    }

    @Delete("/courses/recurrences/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @Trace("DELETE_RECURRENCE")
    public void deleteRecurrence(HttpServerRequest request) {
        String id = request.getParam("id");
        UserUtils.getUserInfos(eb, request, user -> edtService.deleteRecurrence(id, releaseBookingsThen(request, user)));
    }

    /**
     * Après suppression de cours, libère leurs réservations RBS (salles, matériel) puis répond.
     * Ex. suppression du cours du 12/10 en salle 201 → la salle 201 redevient libre ce jour-là.
     */
    private Handler<Either<String, JsonObject>> releaseBookingsThen(HttpServerRequest request, UserInfos user) {
        return result -> {
            if (result.isRight()) {
                JsonArray bookingIds = (JsonArray) result.right().getValue().remove(Field.RBS_BOOKING_IDS);
                if (bookingIds != null && !bookingIds.isEmpty())
                    RbsBridgeService.deleteBookings(eb, bookingIds, user != null ? user.getUserId() : null);
            }
            defaultResponseHandler(request).handle(result);
        };
    }
}
