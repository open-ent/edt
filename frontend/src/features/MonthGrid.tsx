import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Course } from '../api';
import { groupColor, textOn } from '../colors';
import { courseSubject, dayOf, isPast, minutesOf } from '../grid';
import { ymd } from '../utils';
import { CourseActions, CourseDetails, CourseSelection } from './WeekGrid';

interface Props {
  /** Jours affichés, par semaines entières (14 en quinzaine, 28 à 42 en mois). */
  days: Date[];
  /** Mois de référence en vue mois (les jours hors de ce mois sont estompés) ; absent en quinzaine. */
  month?: number;
  courses: Course[];
  teacherName: (id: string) => string | undefined;
  rbsName: (id: number) => string | undefined;
  subjectName: (id: string) => string | undefined;
  actions?: CourseActions;
  selection?: CourseSelection;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Vue compacte de la quinzaine et du mois : une case par jour, les cours y sont listés par heure
 * avec leur matière (même présentation que la vue mois AngularJS, template/calendar/course-month.html).
 * Clic sur un cours → détail. Ex. quinzaine du 12/10 : deux rangées de sept jours.
 */
export function MonthGrid({ days, month, courses, teacherName, rbsName, subjectName, actions, selection }: Props) {
  const { i18n } = useTranslation(['edt', 'common']);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const now = new Date();
  const today = ymd(now);

  const byDay = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const c of courses) map.set(dayOf(c.startDate), [...(map.get(dayOf(c.startDate)) ?? []), c]);
    for (const list of map.values()) list.sort((a, b) => minutesOf(a.startDate) - minutesOf(b.startDate));
    return map;
  }, [courses]);

  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(i18n.language || 'fr', { weekday: 'long' }));

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))', minWidth: 672, border: '1px solid #e0e0e0' }}>
        {weekdays.map((w) => (
          <div key={w} className="text-center fw-bold p-4" style={{ textTransform: 'capitalize', fontSize: 13, borderBottom: '1px solid #e0e0e0' }}>
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = ymd(d);
          const outside = month !== undefined && d.getMonth() !== month;
          return (
            <div
              key={key}
              data-day={key}
              style={{
                minHeight: 96,
                padding: 4,
                borderRight: '1px solid #eee',
                borderBottom: '1px solid #eee',
                background: key === today ? '#fff8e1' : outside ? '#fafafa' : undefined,
                opacity: outside ? 0.6 : 1,
              }}
            >
              <div className="text-end" style={{ fontSize: 12, fontWeight: key === today ? 700 : 400 }}>
                {d.getDate()}
              </div>
              {(byDay.get(key) ?? []).map((c) => {
                const k = `${c._id}|${c.startDate}`;
                const color = groupColor(c.color);
                const from = minutesOf(c.startDate);
                const to = minutesOf(c.endDate);
                const subject = courseSubject(c, subjectName);
                return (
                  <div key={k} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      data-course-id={c._id}
                      aria-expanded={selection?.active ? undefined : openKey === k}
                      aria-pressed={selection?.active ? selection.ids.has(c._id) : undefined}
                      data-selected={selection?.ids.has(c._id) || undefined}
                      onClick={() => (selection?.active ? selection.toggle(c) : setOpenKey((x) => (x === k ? null : k)))}
                      onContextMenu={(e) => {
                        if (!selection) return;
                        e.preventDefault();
                        selection.toggle(c);
                      }}
                      className="w-100 text-start mb-4"
                      style={{
                        border: 0,
                        borderRadius: 4,
                        padding: '1px 4px',
                        fontSize: 11,
                        background: color,
                        color: textOn(color),
                        opacity: isPast(c, now) ? 0.55 : 1,
                        outline: selection?.ids.has(c._id) ? '3px solid #1a5fb4' : undefined,
                        outlineOffset: -3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {selection?.ids.has(c._id) ? '✓ ' : ''}
                      {hhmm(from)} {subject}
                    </button>
                    {openKey === k && (
                      <CourseDetails course={c} subject={subject} from={hhmm(from)} to={hhmm(to)} teacherName={teacherName} rbsName={rbsName} actions={actions} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MonthGrid;
