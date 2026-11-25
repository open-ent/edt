package fr.cgi.edt;

import fr.cgi.edt.controllers.*;
import fr.cgi.edt.cron.HolidaysRefreshCron;
import fr.wseduc.cron.CronTrigger;
import fr.cgi.edt.models.holiday.HolidaysConfig;
import fr.cgi.edt.services.ServiceFactory;
import fr.cgi.edt.services.impl.DefaultCourseService;
import fr.cgi.edt.services.impl.DefaultCourseTagService;
import fr.cgi.edt.services.impl.DefaultInitImpl;
import fr.wseduc.mongodb.MongoDb;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import org.entcore.common.events.EventStore;
import org.entcore.common.events.EventStoreFactory;
import org.entcore.common.http.BaseServer;
import org.entcore.common.http.filter.ShareAndOwner;
import org.entcore.common.mongodb.MongoDbConf;

import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.sql.Sql;

public class Edt extends BaseServer {

    public static final String EDT_COLLECTION = "courses";
    public static final String EDT_SCHEMA = "edt";
    public static final String EXCLUSION_TYPE_TABLE = "exclusion_type";
    public static final String EXCLUSION_JSON_SCHEMA = "exclusion";
    public static final String SEARCH = "edt.search";

    public static String EB_VIESCO_ADDRESS = "viescolaire";

    static EventBus eb;

    @Override
    public void start(Promise<Void> startPromise) throws Exception {
        final Promise<Void> promise = Promise.promise();
        super.start(promise);
        promise.future().compose(init -> initEdt()).onComplete(startPromise);
    }

    private Future<Void> initEdt() {
        eb = getEventBus(vertx);
        final Sql sql = Sql.getInstance();
        final Neo4j neo4j = Neo4j.getInstance();
        final MongoDb mongoDb = MongoDb.getInstance();
        EventStore eventStore = EventStoreFactory.getFactory().getEventStore(Edt.class.getSimpleName());
        ServiceFactory serviceFactory = new ServiceFactory(vertx, config, sql, neo4j, mongoDb);

        addController(new EdtController(EDT_COLLECTION, eb, eventStore));
        addController(new EventBusController(serviceFactory));
        addController(new InitController(serviceFactory));
        addController(new SearchController(eb));
        addController(new CourseController(eb, new DefaultCourseService(serviceFactory)));
        addController(new ConfigController());
        addController(new CourseTagController(new DefaultCourseTagService(sql, mongoDb)));
        addController(new HolidaysController(serviceFactory.holidaysService()));

        // Rafraîchissement hebdomadaire des vacances scolaires (zone de chaque établissement).
        // Désactivable en mettant "holidays-refresh-cron" à une chaîne vide.
        String holidaysCron = config.getString("holidays-refresh-cron", "0 0 3 ? * MON");
        if (holidaysCron != null && !holidaysCron.trim().isEmpty()) {
            try {
                new CronTrigger(vertx, holidaysCron).schedule(new HolidaysRefreshCron(serviceFactory.holidaysService()));
            } catch (Exception e) {
                log.error("[Edt] Invalid holidays-refresh-cron expression: " + holidaysCron, e);
            }
        }

        MongoDbConf.getInstance().setCollection(EDT_COLLECTION);
        setDefaultResourceFilter(new ShareAndOwner());

        return Future.succeededFuture();
    }
}
