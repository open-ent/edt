import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Course, TimeSlot } from '../api';
import { groupColor } from '../colors';
import { axisBounds, courseSubject, dayOf, isPast, minutesOf, minutesOfHour, placeDay } from '../grid';
import { addDays, ymd } from '../utils';

/** Hauteur d'une minute à l'écran : une heure = 64 px. */
const PX_PER_MIN = 64 / 60;
/** Fond d'un cours étiqueté (grisé, comme l'IHM AngularJS). */
const TAGGED_BACKGROUND = 'rgba(246, 246, 246, 1)';

interface Props {
  monday: Date;
  courses: Course[];
  slots: TimeSlot[];
  teacherName: (id: string) => string | undefined;
  rbsName: (id: number) => string | undefined;
  subjectName: (id: string) => string | undefined;
  /** Cours ciblé par un lien profond (mis en évidence et amené à l'écran). */
  highlighted?: Course;
  highlightRef?: (el: HTMLElement | null) => void;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Semaine de l'emploi du temps, du lundi au dimanche, sur un axe horaire réel : chaque cours est
 * placé à la minute et les cours simultanés se partagent la largeur de la journée (aucun n'est
 * masqué). Survol ou clic sur un cours → détail (horaire, enseignants, classes, salles, ressources
 * RBS, étiquettes). Ex. deux cours de 08:00 à 09:00 le lundi → deux colonnes côte à côte.
 */
export function WeekGrid({ monday, courses, slots, teacherName, rbsName, subjectName, highlighted, highlightRef }: Props) {
  const { t, i18n } = useTranslation(['edt', 'common']);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const now = new Date();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const { start, end } = useMemo(() => axisBounds(slots, courses), [slots, courses]);
  const height = (end - start) * PX_PER_MIN;
  const placedByDay = useMemo(() => {
    const byDay = new Map<string, Course[]>();
    for (const c of courses) byDay.set(dayOf(c.startDate), [...(byDay.get(dayOf(c.startDate)) ?? []), c]);
    return new Map([...byDay].map(([day, list]) => [day, placeDay(list)]));
  }, [courses]);

  const dayLabel = (d: Date) =>
    d.toLocaleDateString(i18n.language || 'fr', { weekday: 'long', day: '2-digit', month: '2-digit' });

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(7, minmax(110px, 1fr))', minWidth: 840 }}>
        <div />
        {days.map((d) => (
          <div key={ymd(d)} className="text-center fw-bold pb-8" style={{ textTransform: 'capitalize', fontSize: 13 }}>
            {dayLabel(d)}
          </div>
        ))}

        {/* Axe : créneaux de l'établissement à leur heure de début */}
        <div style={{ position: 'relative', height }}>
          {slots.map((s) => (
            <div
              key={s.id}
              className="text-muted"
              style={{ position: 'absolute', top: (minutesOfHour(s.startHour) - start) * PX_PER_MIN, right: 6, fontSize: 12, lineHeight: 1.1, textAlign: 'right' }}
            >
              <strong>{s.name}</strong>
              <br />
              {s.startHour}
            </div>
          ))}
        </div>

        {days.map((d) => (
          <div
            key={ymd(d)}
            data-day={ymd(d)}
            style={{ position: 'relative', height, borderLeft: '1px solid #e0e0e0', background: d.getDay() === 0 ? '#fafafa' : undefined }}
          >
            {slots.map((s) => (
              <div
                key={s.id}
                aria-hidden
                style={{ position: 'absolute', left: 0, right: 0, top: (minutesOfHour(s.startHour) - start) * PX_PER_MIN, borderTop: '1px dashed #e6e6e6' }}
              />
            ))}
            {(placedByDay.get(ymd(d)) ?? []).map(({ course: c, start: from, end: to, lane, lanes }) => {
              const tagged = (c.tags ?? []).length > 0;
              const past = isPast(c, now);
              const isOpen = openId === c._id || hoverId === c._id;
              const isHighlighted = highlighted?._id === c._id && dayOf(highlighted.startDate) === dayOf(c.startDate);
              const subject = courseSubject(c, subjectName);
              const audience = [...(c.classes ?? []), ...(c.groups ?? [])].join(' ');
              const rooms = (c.roomLabels ?? []).filter((r) => r);
              const key = `${c._id}|${c.startDate}`;
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    top: (from - start) * PX_PER_MIN,
                    height: Math.max((to - from) * PX_PER_MIN - 2, 18),
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                    zIndex: isOpen ? 20 : 1,
                  }}
                  onMouseEnter={() => setHoverId(c._id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <button
                    type="button"
                    ref={isHighlighted ? highlightRef : undefined}
                    className="w-100 h-100 text-start"
                    aria-expanded={isOpen}
                    data-course-id={c._id}
                    onClick={() => setOpenId((id) => (id === c._id ? null : c._id))}
                    style={{
                      border: isHighlighted ? '2px solid #e0a800' : 0,
                      borderLeft: `4px solid ${groupColor(c.color)}`,
                      borderRadius: 4,
                      padding: '2px 6px',
                      overflow: 'hidden',
                      background: tagged ? TAGGED_BACKGROUND : groupColor(c.color),
                      color: tagged ? '#222' : '#fff',
                      opacity: past ? 0.55 : 1,
                      fontSize: 12,
                      lineHeight: 1.25,
                    }}
                  >
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subject}</div>
                    {audience && <div style={{ fontStyle: 'italic' }}>{audience}</div>}
                    {rooms.length > 0 && <div>{t('edt.utils.room')} : {rooms.join(', ')}</div>}
                    {tagged && <div>{(c.tags ?? []).map((tag) => tag.abbreviation).filter(Boolean).join(' ')}</div>}
                  </button>
                  {isOpen && (
                    <CourseDetails
                      course={c}
                      subject={subject}
                      from={hhmm(from)}
                      to={hhmm(to)}
                      teacherName={teacherName}
                      rbsName={rbsName}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DetailsProps {
  course: Course;
  subject: string;
  from: string;
  to: string;
  teacherName: (id: string) => string | undefined;
  rbsName: (id: number) => string | undefined;
}

/** Détail d'un cours, contenu identique à l'infobulle AngularJS (template/calendar/course-tooltip.html). */
function CourseDetails({ course: c, subject, from, to, teacherName, rbsName }: DetailsProps) {
  const { t } = useTranslation(['edt', 'common']);
  const teachers = (c.teacherIds ?? []).map(teacherName).filter(Boolean);
  const rooms = (c.roomLabels ?? []).filter((r) => r);
  const resources = (c.rbsResourceIds ?? []).map(rbsName).filter(Boolean);
  const tags = (c.tags ?? []).map((tag) => tag.label).filter(Boolean);
  return (
    <div
      role="tooltip"
      className="card shadow p-8"
      style={{ position: 'absolute', top: '100%', left: 0, minWidth: 220, marginTop: 4, background: '#fff', color: '#222', fontSize: 13, zIndex: 30 }}
    >
      <div className="fw-bold mb-4" style={{ borderLeft: `4px solid ${groupColor(c.color)}`, paddingLeft: 6 }}>{subject}</div>
      <div>{from} – {to}</div>
      {teachers.length > 0 && <div>{teachers.join(', ')}</div>}
      {[...(c.classes ?? []), ...(c.groups ?? [])].length > 0 && (
        <div style={{ fontStyle: 'italic' }}>{[...(c.classes ?? []), ...(c.groups ?? [])].join(' ')}</div>
      )}
      {rooms.length > 0 && <div>{t('edt.utils.room')} : {rooms.join(', ')}</div>}
      {resources.length > 0 && <div>{t('edt.utils.resource')} : {resources.join(', ')}</div>}
      {tags.length > 0 && <div>{tags.join(', ')}</div>}
    </div>
  );
}

export default WeekGrid;
