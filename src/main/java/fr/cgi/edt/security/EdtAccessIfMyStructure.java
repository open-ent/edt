package fr.cgi.edt.security;

import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.http.filter.ResourcesProvider;
import org.entcore.common.user.UserInfos;

/**
 * Autorise la lecture des cours d'un établissement (paramètre de route {@code :structureId}) à qui
 * y a légitimement accès : le super-admin plateforme, un usager rattaché à l'établissement (élève,
 * parent — rattaché aux établissements de ses enfants —, enseignant, personnel), ou une fonction
 * dont le périmètre couvre l'établissement (ADML, inspecteur, collectivité).
 * Même logique que {@code AccessIfMyStructure} de vie-scolaire, qui protège déjà
 * {@code /viescolaire/common/courses}.
 *
 * Ex. un enseignant du Collège A demande {@code /edt/structures/<id du Lycée B>/common/courses/…}
 * → refusé (401) ; l'ADML dont le périmètre couvre le Lycée B → autorisé, même sans y être rattaché.
 */
public class EdtAccessIfMyStructure implements ResourcesProvider {
    @Override
    public void authorize(HttpServerRequest request, Binding binding, UserInfos user, Handler<Boolean> handler) {
        final String structureId = request.getParam("structureId");
        if (structureId == null || structureId.isEmpty()) {
            handler.handle(false);
            return;
        }
        if (user.isADMC()) {
            handler.handle(true);
            return;
        }
        if (user.getStructures() != null && user.getStructures().contains(structureId)) {
            handler.handle(true);
            return;
        }
        if (user.getFunctions() != null) {
            for (UserInfos.Function function : user.getFunctions().values()) {
                if (function.getScope() != null && function.getScope().contains(structureId)) {
                    handler.handle(true);
                    return;
                }
            }
        }
        handler.handle(false);
    }
}
