/**
 * The Course clock (next-level ticket 21): the timed run's readout at the top
 * of the screen on the Practice Range. Ready on the start pad, ticking through
 * the run, and held for a few seconds after the finish with the grade and the
 * time against your best.
 */
import { courseDelta, courseGrade, courseTime, type CourseGrade, type CoursePar } from '../course-run';

/** How long a finished run's result stays up (s). */
export const RESULT_SECONDS = 6;

export type CourseFace =
  /** Standing on the start pad: what to beat. */
  | { readonly kind: 'ready'; readonly best: number | null; readonly par: CoursePar }
  /** The clock is running. */
  | { readonly kind: 'running'; readonly seconds: number; readonly best: number | null }
  /** Just finished: the time, the grade it earned, and how it stands against the best held before it. */
  | { readonly kind: 'result'; readonly seconds: number; readonly grade: CourseGrade | null; readonly before: number | null };

const GRADE_NAME: Readonly<Record<CourseGrade, string>> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

/** The face's three lines: a label, the figure, and the line under it. */
export function courseLines(face: CourseFace): { label: string; figure: string; note: string; best: boolean } {
  switch (face.kind) {
    case 'ready':
      return {
        label: 'Course · ready',
        figure: courseTime(0),
        note: face.best === null ? `Gold ${courseTime(face.par.gold)} · Silver ${courseTime(face.par.silver)} · Bronze ${courseTime(face.par.bronze)}` : `Best ${courseTime(face.best)} · Gold ${courseTime(face.par.gold)}`,
        best: false,
      };
    case 'running':
      return { label: 'Course', figure: courseTime(face.seconds), note: face.best === null ? 'First run' : `Best ${courseTime(face.best)}`, best: false };
    case 'result': {
      const grade = face.grade ? GRADE_NAME[face.grade] : 'No grade';
      const best = face.before === null || face.seconds < face.before;
      const against = face.before === null ? 'First time on the board' : best ? `New best ${courseDelta(face.seconds, face.before)}` : `${courseDelta(face.seconds, face.before)} on best`;
      return { label: `Course · ${grade}`, figure: courseTime(face.seconds), note: against, best };
    }
  }
}

const COURSE_CLOCK_CSS = `
.ds-course { position: absolute; top: calc(var(--ds-safe-t, 0px) + 18px); left: 50%; transform: translateX(-50%); min-width: 220px; padding: 8px 18px 10px; background: var(--ds-scrim-soft); border-top: 2px solid var(--ds-line-2); text-align: center; text-transform: uppercase; letter-spacing: 0.06em; }
.ds-course[hidden] { display: none; }
.ds-course .label { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-course .figure { font-family: var(--ds-font-display); font-size: var(--ds-type-display); font-weight: 700; line-height: 1; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; }
.ds-course .note { font-size: var(--ds-type-small); color: var(--ds-text-2); text-transform: none; letter-spacing: 0.02em; margin-top: 4px; }
.ds-course.result { border-top-color: var(--ds-text); }
.ds-course.best { border-top: 4px solid var(--ds-text); padding-top: 6px; }
.ds-course.best .note { color: var(--ds-text); font-weight: 700; }
`;

/** The clock's element on the HUD. */
export class CourseClockView {
  readonly #el: HTMLDivElement;
  readonly #label: HTMLDivElement;
  readonly #figure: HTMLDivElement;
  readonly #note: HTMLDivElement;
  #last = '';

  constructor(parent: HTMLElement) {
    if (!document.getElementById('ds-course-css')) {
      const style = document.createElement('style');
      style.id = 'ds-course-css';
      style.textContent = COURSE_CLOCK_CSS;
      document.head.append(style);
    }
    this.#el = document.createElement('div');
    this.#el.className = 'ds-course';
    this.#el.hidden = true;
    this.#label = document.createElement('div');
    this.#label.className = 'label';
    this.#figure = document.createElement('div');
    this.#figure.className = 'figure';
    this.#note = document.createElement('div');
    this.#note.className = 'note';
    this.#el.append(this.#label, this.#figure, this.#note);
    parent.append(this.#el);
  }

  paint(face: CourseFace | null): void {
    if (!face) {
      if (!this.#el.hidden) this.#el.hidden = true;
      this.#last = '';
      return;
    }
    const lines = courseLines(face);
    const key = `${face.kind}|${lines.label}|${lines.figure}|${lines.note}|${lines.best}`;
    if (key === this.#last) return;
    this.#last = key;
    this.#el.hidden = false;
    this.#el.className = `ds-course${face.kind === 'result' ? ' result' : ''}${lines.best ? ' best' : ''}`;
    this.#label.textContent = lines.label;
    this.#figure.textContent = lines.figure;
    this.#note.textContent = lines.note;
  }

  dispose(): void {
    this.#el.remove();
  }
}
