package fr.cgi.edt.controllers;

import fr.cgi.edt.security.EdtAccessIfMyStructure;
import fr.cgi.edt.security.ManageHolidaysZone;
import fr.cgi.edt.services.HolidaysService;
import fr.cgi.edt.services.impl.DefaultHolidaysService;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.SuperAdminFilter;
import org.entcore.common.http.filter.ResourceFilter;

import java.util.Collections;
import java.util.regex.Pattern;

/**
 * Vacances scolaires par zone. Ex. {@code GET /edt/structures/<id>/holidays?start=2026-12-01&end=2027-01-31}
 * → vacances de Noël de la zone de l'établissement, jours fériés et exclusions saisies.
 */
public class HolidaysController extends ControllerHelper {

    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private final HolidaysService holidaysService;

    public HolidaysController(HolidaysService holidaysService) {
        this.holidaysService = holidaysService;
    }

    @Get("/structures/:structureId/holidays-zone")
    @ApiDoc("Zone de vacances de l'établissement : retenue, et déduite de son académie")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(EdtAccessIfMyStructure.class)
    public void getZone(final HttpServerRequest request) {
        holidaysService.getZone(request.getParam("structureId"))
                .onSuccess(zone -> renderJson(request, zone))
                .onFailure(err -> renderError(request, new JsonObject().put("error", err.getMessage())));
    }

    @Put("/structures/:structureId/holidays-zone")
    @ApiDoc("Force la zone de vacances ({zone}) ou revient à celle de l'académie ({zone: null}), puis rafraîchit")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(ManageHolidaysZone.class)
    public void setZone(final HttpServerRequest request) {
        RequestUtils.bodyToJson(request, body -> {
            String zone = body.getString("zone");
            if (zone != null && !DefaultHolidaysService.isValidZone(zone)) {
                badRequest(request, "edt.holidays.zone.invalid");
                return;
            }
            holidaysService.setZone(request.getParam("structureId"), zone)
                    .onSuccess(result -> renderJson(request, result))
                    .onFailure(err -> renderError(request, new JsonObject().put("error", err.getMessage())));
        });
    }

    @Get("/structures/:structureId/holidays")
    @ApiDoc("Vacances, jours fériés et exclusions de l'établissement entre start et end (yyyy-MM-dd)")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(EdtAccessIfMyStructure.class)
    public void getHolidays(final HttpServerRequest request) {
        String start = request.getParam("start");
        String end = request.getParam("end");
        if (start == null || end == null || !ISO_DATE.matcher(start).matches() || !ISO_DATE.matcher(end).matches()) {
            badRequest(request, "edt.holidays.range.invalid");
            return;
        }
        holidaysService.getHolidays(Collections.singletonList(request.getParam("structureId")), start, end)
                .onSuccess(holidays -> renderJson(request, holidays))
                .onFailure(err -> renderError(request, new JsonObject().put("error", err.getMessage())));
    }

    @Post("/task/holidays-refresh")
    @ApiDoc("Lance à la demande le rafraîchissement hebdomadaire des vacances (super-admin)")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(SuperAdminFilter.class)
    public void refreshAll(final HttpServerRequest request) {
        holidaysService.refreshAll()
                .onSuccess(report -> renderJson(request, report))
                .onFailure(err -> renderError(request, new JsonObject().put("error", err.getMessage())));
    }
}
