package fr.cgi.edt.cron;

import fr.cgi.edt.services.HolidaysService;
import io.vertx.core.Handler;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;

/**
 * Réimporte chaque semaine les vacances scolaires et jours fériés de tous les établissements
 * initialisés, d'après leur zone (cf. {@link HolidaysService#refreshAll()}).
 */
public class HolidaysRefreshCron implements Handler<Long> {

    private static final Logger log = LoggerFactory.getLogger(HolidaysRefreshCron.class);
    private final HolidaysService holidaysService;

    public HolidaysRefreshCron(HolidaysService holidaysService) {
        this.holidaysService = holidaysService;
    }

    @Override
    public void handle(Long event) {
        log.info("[Edt@HolidaysRefreshCron] Refreshing school holidays");
        holidaysService.refreshAll()
                .onSuccess(report -> log.info("[Edt@HolidaysRefreshCron] Done: " + report.encode()))
                .onFailure(err -> log.error("[Edt@HolidaysRefreshCron] Failed: " + err.getMessage()));
    }
}
