package fr.cgi.edt.security;

import fr.cgi.edt.utils.EdtWorkflowActions;
import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.http.filter.ResourcesProvider;
import org.entcore.common.user.UserInfos;

/**
 * Changer la zone de vacances d'un établissement (paramètre {@code :structureId}) : il faut le
 * droit d'initialiser l'année ou de gérer l'emploi du temps, ET l'établissement dans son
 * périmètre (cf. {@link EdtAccessIfMyStructure}). Le super-admin passe toujours.
 */
public class ManageHolidaysZone implements ResourcesProvider {
    @Override
    public void authorize(HttpServerRequest request, Binding binding, UserInfos user, Handler<Boolean> handler) {
        if (user.isADMC()) {
            handler.handle(true);
            return;
        }
        WorkflowActionUtils rights = new WorkflowActionUtils();
        boolean canManage = rights.hasRight(user, WorkflowActionUtils.VIESCO_SETTING_INIT_DATA)
                || rights.hasRight(user, EdtWorkflowActions.MANAGE.toString());
        if (!canManage) {
            handler.handle(false);
            return;
        }
        new EdtAccessIfMyStructure().authorize(request, binding, user, handler);
    }
}
