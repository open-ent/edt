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
import io.vertx.core.Handler;
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
        // CCTP 51C — bascule AngularJS/React. Défaut piloté par la conf `frontend-ui`
        // (bloc du module dans ent-core.yaml, alimentée par FRONTEND_UI_DEFAULT ; fallback "angular"),
        // surchargée à la demande par `?ui=react|angular`.
        final String uiParam = request.params().get("ui");
        final String frontendUi = "react".equals(config.getString("frontend-ui", "angular")) ? "react" : "angular";
        final String ui = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : frontendUi;
        if ("react".equals(ui)) {
            renderView(request, new JsonObject(), "edt-react.html", null);
        } else {
            renderView(request);
        }
        this.eventStore.createAndStoreEvent(EventStores.ACCESS, request);
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
                                if (!oldBookingIds.isEmpty())
                                    RbsBridgeService.deleteBookings(eb, oldBookingIds, user != null ? user.getUserId() : null);
                                if (user != null) {
                                    RbsBridgeService.syncBookings(eb, body, user.getUserId()).onComplete(ar -> {
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
        edtService.deleteCourse(id, defaultResponseHandler(request));
    }

    @Delete("/courses/recurrences/:id")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageCourseWorkflowAction.class)
    @Trace("DELETE_RECURRENCE")
    public void deleteRecurrence(HttpServerRequest request) {
        String id = request.getParam("id");
        edtService.deleteRecurrence(id, defaultResponseHandler(request));
    }
}
