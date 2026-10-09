import {ng, Service} from "entcore";
import {http, HttpResponse} from 'entcore-toolkit';

export interface ICourseService {
    getCourseRecurrenceDates(recurrenceId: string): Promise<{startDate: string; endDate: string}>;

    getCourse(id: string): Promise<any>;

    updateCoursesTag(courseIds: Array<string>, tagId: string): Promise<HttpResponse>;
}

export const courseService: ICourseService = {
    getCourseRecurrenceDates: async (recurrenceId: string): Promise<{startDate: string; endDate: string}> => {
        return http.get(`/edt/courses/recurrences/dates/${recurrenceId}`)
            .then((res: HttpResponse): { startDate: string; endDate: string} => {
                return res.data;
            });
    },

    // Récupère le document complet d'un cours par _id (avec les champs absents de la grille,
    // ex : resources / documents attachés). Utilisé à l'ouverture du formulaire d'édition.
    getCourse: async (id: string): Promise<any> => {
        return http.get(`/edt/courses/${id}`).then((res: HttpResponse): any => res.data);
    },

    updateCoursesTag: async (courseIds: Array<string>, tagId: string): Promise<HttpResponse> => {
        return http.put(`/edt/courses/tag`, {courseIds: courseIds, tagId: tagId});
    }
};

export const CourseService: Service = ng.service('CourseService',
    (): ICourseService => courseService);