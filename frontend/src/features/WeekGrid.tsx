import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Course, TimeSlot } from '../api';
import { groupColor, textOn } from '../colors';
import { isEditable } from '../courseForm';
import { axisBounds, courseSubject, dayOf, isPast, minutesOf, minutesOfHour, placeDay } from '../grid';
import { ymd } from '../utils';

/** Hauteur d'une minute à l'écran : une heure = 64 px. */
const PX_PER_MIN = 64 / 60;
/** Fond d'un cours étiqueté (grisé, comme l'IHM AngularJS). */
const TAGGED_BACKGROUND = 'rgba(246, 246, 246, 1)';

interface Props {
  /** Jours affichés : un seul en vue Jour, sept en vue Semaine. */
  days: Date[];
  /** Repères tous les quarts d'heure (option d'affichage, active par défaut comme l'AngularJS). */
  showQuarterHours?: boolean;
  /** Actions du détail d'un cours (gestionnaires seulement), cf. CourseActions. */
  actions?: CourseActions;
  /** Sélection pour les actions de masse (gestionnaires seulement). */
  selection?: CourseSelection;
  courses: Course[];
  slots: TimeSlot[];
  teacherName: (id: string) => string | undefined;
  rbsName: (id: number) => string | undefined;
  subjectName: (id: string) => string | undefined;
  /** Cours ciblé par un lien profond (mis en évidence et amené à l'écran). */
  highlighted?: Course;
  highlightRef?: (el: HTMLElement | null) => void;
  /** Clic sur un créneau vide (droit de gestion) : création d'un cours à ce jour et cette heure. */
  onCreateAt?: (date: string, minutes: number) => void;
  /** Cours glissé-déposé (droit de gestion) : nouveau jour et minute de début (avant calage). */
  onMove?: (course: Course, date: string, startMinutes: number) => void;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Semaine de l'emploi du temps, du lundi au dimanche, sur un axe horaire réel : chaque cours est
 * placé à la minute et les cours simultanés se partagent la largeur de la journée (aucun n'est
 * masqué). Survol ou clic sur un cours → détail (horaire, enseignants, classes, salles, ressources
 * RBS, étiquettes). Ex. deux cours de 08:00 à 09:00 le lundi → deux colonnes côte à côte.
 */
export function WeekGrid({ days, showQuarterHours = true, actions, selection, courses, slots, teacherName, rbsName, subjectName, highlighted, highlightRef, onCreateAt, onMove }: Props) {
  const { t, i18n } = useTranslation(['edt', 'common']);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Glisser-déposer : cours saisi et minutes entre son début et le point de saisie (ex. saisi
  // 20 min sous son haut → déposé à 10:20, il commence à 10:00).
  const dragging = useRef<{ course: Course; grabMinutes: number } | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const now = new Date();

  const { start, end } = useMemo(() => axisBounds(slots, courses), [slots, courses]);
  const quarters = useMemo(() => {
    const marks: number[] = [];
    for (let m = Math.ceil(start / 15) * 15; m < end; m += 15) if (m % 60 !== 0) marks.push(m);
    return marks;
  }, [start, end]);
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
      <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${days.length}, minmax(84px, 1fr))`, minWidth: 64 + 84 * days.length }}>
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
          {/* Graduations des quarts d'heure sur l'axe, ex. un tiret à 08:15, plus long à 08:30. */}
          {showQuarterHours &&
            quarters.map((m) => (
              <div
                key={m}
                aria-hidden
                data-quarter-tick
                style={{ position: 'absolute', right: 0, width: m % 30 === 0 ? 10 : 5, top: (m - start) * PX_PER_MIN, borderTop: '1px solid #8f99a8' }}
              />
            ))}
        </div>

        {days.map((d) => (
          <div
            key={ymd(d)}
            data-day={ymd(d)}
            style={{
              position: 'relative',
              height,
              borderLeft: '1px solid #e0e0e0',
              background: d.getDay() === 0 ? '#fafafa' : undefined,
              cursor: onCreateAt ? 'copy' : undefined,
              boxShadow: dropDay === ymd(d) ? 'inset 0 0 0 2px #1a5fb4' : undefined,
            }}
            onDragOver={(e) => {
              if (!dragging.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropDay !== ymd(d)) setDropDay(ymd(d));
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDropDay(null);
            }}
            onDrop={(e) => {
              const drag = dragging.current;
              dragging.current = null;
              setDropDay(null);
              if (!drag || !onMove) return;
              e.preventDefault();
              const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
              onMove(drag.course, ymd(d), start + offset / PX_PER_MIN - drag.grabMinutes);
            }}
            onClick={(e) => {
              // Seul un clic sur le fond de la journée crée un cours (pas sur un cours existant).
              if (!onCreateAt || e.target !== e.currentTarget) return;
              const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
              onCreateAt(ymd(d), Math.round(start + offset / PX_PER_MIN));
            }}
          >
            {slots.map((s) => (
              <div
                key={s.id}
                aria-hidden
                style={{ position: 'absolute', left: 0, right: 0, top: (minutesOfHour(s.startHour) - start) * PX_PER_MIN, borderTop: '1px dashed #d9d9d9', pointerEvents: 'none' }}
              />
            ))}
            {showQuarterHours &&
              quarters.map((m) => (
                <div
                  key={m}
                  aria-hidden
                  data-quarter
                  // Nettement plus foncés que les traits de plage (#d9d9d9) : sinon cocher la case
                  // « Quarts d'heure » ne change rien à l'œil. Ex. 08:30 tireté, 08:15 / 08:45 pointillé.
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (m - start) * PX_PER_MIN,
                    borderTop: m % 30 === 0 ? '1px dashed #8f99a8' : '1px dotted #a7b0bd',
                    pointerEvents: 'none',
                  }}
                />
              ))}
            {(placedByDay.get(ymd(d)) ?? []).map(({ course: c, start: from, end: to, lane, lanes }) => {
              const tagged = (c.tags ?? []).length > 0;
              const past = isPast(c, now);
              const isOpen = !selection?.active && (openId === c._id || hoverId === c._id);
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
                    className="w-100 h-100 text-start d-flex flex-column justify-content-start"
                    aria-expanded={selection?.active ? undefined : isOpen}
                    aria-pressed={selection?.active ? selection.ids.has(c._id) : undefined}
                    data-course-id={c._id}
                    data-selected={selection?.ids.has(c._id) || undefined}
                    draggable={!!onMove && !selection?.active && isEditable(c.startDate, now)}
                    onDragStart={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      dragging.current = { course: c, grabMinutes: (e.clientY - rect.top) / PX_PER_MIN };
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', c._id);
                      setOpenId(null);
                      setHoverId(null);
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      setDropDay(null);
                    }}
                    onClick={() => (selection?.active ? selection.toggle(c) : setOpenId((id) => (id === c._id ? null : c._id)))}
                    onContextMenu={(e) => {
                      if (!selection) return;
                      e.preventDefault();
                      selection.toggle(c);
                    }}
                    style={{
                      border: isHighlighted ? '2px solid #e0a800' : 0,
                      outline: selection?.ids.has(c._id) ? '3px solid #1a5fb4' : undefined,
                      outlineOffset: -3,
                      borderLeft: `4px solid ${groupColor(c.color)}`,
                      borderRadius: 4,
                      padding: '2px 6px',
                      overflow: 'hidden',
                      background: tagged ? TAGGED_BACKGROUND : groupColor(c.color),
                      color: textOn(tagged ? TAGGED_BACKGROUND : groupColor(c.color)),
                      opacity: past ? 0.55 : 1,
                      fontSize: 12,
                      lineHeight: 1.25,
                    }}
                  >
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, maxWidth: '100%' }}>
                      {selection?.ids.has(c._id) && <span aria-hidden>✓ </span>}
                      {subject}
                    </div>
                    {audience && <div style={{ fontStyle: 'italic', flexShrink: 0 }}>{audience}</div>}
                    {rooms.length > 0 && <div style={{ flexShrink: 0 }}>{t('edt.utils.room')} : {rooms.join(', ')}</div>}
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
                      actions={actions}
                      // Cours de seconde moitié de journée : détail au-dessus, sinon il sort de la grille.
                      above={from - start > (end - start) / 2}
                      // Ouvert au simple survol : transparent aux clics, sinon il masque les cours
                      // recouverts (ex. détail du cours de 08:00-12:00 posé sur celui de 16:15).
                      interactive={openId === c._id}
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
  actions?: CourseActions;
  /** Ouvrir le détail au-dessus du cours plutôt qu'en dessous. */
  above?: boolean;
  /** Ouvert par un clic (boutons utilisables) ; faux pour un détail de survol. */
  interactive?: boolean;
}

/**
 * Sélection de cours pour les actions de masse : `active` = mode sélection (un clic coche/décoche) ;
 * le clic droit coche/décoche toujours, comme l'AngularJS.
 */
export interface CourseSelection {
  active: boolean;
  ids: ReadonlySet<string>;
  toggle: (course: Course) => void;
}

/** Modifier / supprimer depuis le détail d'un cours ; absent pour qui ne gère pas les cours. */
export interface CourseActions {
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
}

/** Détail d'un cours, contenu identique à l'infobulle AngularJS (template/calendar/course-tooltip.html). */
export function CourseDetails({ course: c, subject, from, to, teacherName, rbsName, actions, above = false, interactive = true }: DetailsProps) {
  const { t } = useTranslation(['edt', 'common']);
  const teachers = (c.teacherIds ?? []).map(teacherName).filter(Boolean);
  const rooms = (c.roomLabels ?? []).filter((r) => r);
  const resources = (c.rbsResourceIds ?? []).map(rbsName).filter(Boolean);
  const tags = (c.tags ?? []).map((tag) => tag.label).filter(Boolean);
  return (
    <div
      role="tooltip"
      className="card shadow p-8"
      style={{
        position: 'absolute',
        ...(above ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
        left: 0,
        minWidth: 220,
        background: '#fff',
        color: '#222',
        fontSize: 13,
        zIndex: 30,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
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
      {/* Comme l'AngularJS : plus de modification ni de suppression 15 minutes avant le début. */}
      {actions &&
        (isEditable(c.startDate, new Date()) ? (
          <div className="d-flex gap-8 mt-8">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => actions.onEdit(c)}>{t('edt.utils.modify')}</button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => actions.onDelete(c)}>{t('edt.utils.delete')}</button>
          </div>
        ) : (
          <div className="text-muted mt-8" style={{ fontSize: 12 }}>{t('edt.cantDelete.courses.before')}</div>
        ))}
    </div>
  );
}

export default WeekGrid;
