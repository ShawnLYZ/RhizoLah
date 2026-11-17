import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot, ClipboardList, ShieldAlert, Sprout } from 'lucide-react'
import { openTaskCount, taskComplete, useApp, type Task } from '../state/store'
import { listSensors } from '../sim/ranges'
import { BAND_WORD } from '../ui/components'
import { formatMYTDateTime } from '../ui/time'

const STEP_WORDS: Record<Task['kind'], [string, string, string]> = {
  restoration: ['Task created', 'Planted', 'Done growing'],
  prevention: ['Task created', 'Site checked', 'Done fixing'],
}

const BUTTON_WORDS: Record<Task['kind'], [string, string]> = {
  restoration: ['Plant!', 'Done Growing!'],
  prevention: ['Check Site!', 'Done Fixing!'],
}

const TITLE: Record<Task['kind'], string> = { restoration: 'Restoration Task', prevention: 'Prevention Task' }

function TaskIcon({ kind, size = 18 }: { kind: Task['kind']; size?: number }) {
  return kind === 'restoration' ? <Sprout size={size} aria-hidden="true" /> : <ShieldAlert size={size} aria-hidden="true" />
}

/** Open tasks first, newest first; then completed tasks, most recently completed first. */
function ordered(tasks: Task[]): Task[] {
  const open = tasks.filter((t) => !taskComplete(t)).sort((a, b) => b.createdAt - a.createdAt)
  const done = tasks.filter(taskComplete).sort((a, b) => (b.steps[1] ?? 0) - (a.steps[1] ?? 0))
  return [...open, ...done]
}

function Timeline({ task }: { task: Task }) {
  const times = [task.createdAt, task.steps[0], task.steps[1]]
  const next = times.findIndex((t) => t === null)
  return (
    <ol className="tl">
      {STEP_WORDS[task.kind].map((w, i) => {
        const at = times[i]
        const state = at !== null ? 'done' : i === next ? 'next' : 'later'
        return (
          <li key={w} className={`tl-step ${state}`}>
            {state === 'done' ? <CircleCheck size={17} aria-hidden="true" /> : state === 'next' ? <CircleDot size={17} aria-hidden="true" /> : <Circle size={17} aria-hidden="true" />}
            <span className="tl-word">{w}</span>
            {at !== null ? <span className="tl-time num">{formatMYTDateTime(at)}</span> : <span className="sr-only">{state === 'next' ? 'next step' : 'not done yet'}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Facts({ task }: { task: Task }) {
  if (task.kind === 'restoration') {
    return <p className="task-facts num">{task.areaM2.toLocaleString('en-MY')} m² · <i>{task.species}</i></p>
  }
  return (
    <>
      <p className="task-facts">{listSensors(task.sensors)} in {BAND_WORD[task.band]}</p>
      <p className="task-advice">{task.advice}</p>
    </>
  )
}

function TaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false)
  const done = taskComplete(task)
  if (done) {
    return (
      <div className="task task-done" data-testid="task-card">
        <button className="task-line" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          <CircleCheck size={17} className="task-check" aria-hidden="true" />
          <span className="task-line-title">{TITLE[task.kind]}</span>
          <span className="task-line-site">{task.siteName}</span>
          <span className="task-line-state">Complete</span>
          <span className="task-line-time num">{formatMYTDateTime(task.steps[1] ?? task.createdAt)}</span>
          {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        </button>
        {expanded && (
          <div className="task-body">
            <Facts task={task} />
            <Timeline task={task} />
          </div>
        )}
      </div>
    )
  }
  const step = task.steps[0] === null ? 0 : 1
  return (
    <div className="task" data-testid="task-card">
      <div className="task-head">
        <span className="task-title"><TaskIcon kind={task.kind} /> {TITLE[task.kind]}</span>
        <span className="task-site">{task.siteName}</span>
      </div>
      <Facts task={task} />
      <Timeline task={task} />
      <button className="btn btn-primary btn-sm task-next" data-testid="task-next-step" onClick={() => useApp.getState().advanceTask(task.id)}>
        {BUTTON_WORDS[task.kind][step]}
      </button>
    </div>
  )
}

/** The Tasks icon (in the bell's old place) and its dropdown. Rings once per task created in this tab. */
export function TasksButton() {
  const tasks = useApp((s) => s.tasks)
  const openCount = useApp(openTaskCount)
  const ring = useApp((s) => s.taskRing)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false) }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="bell-box" ref={boxRef}>
      <button
        className="icon-btn bell-btn"
        aria-label={openCount ? `Tasks, ${openCount} open` : 'Tasks'}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="tasks-button"
      >
        <span key={ring} className={ring ? 'bell-ring' : undefined}><ClipboardList size={21} /></span>
        {openCount > 0 && <span className="bell-badge num" aria-hidden="true">{openCount}</span>}
      </button>
      {open && (
        <div className="menu tasks-panel" role="region" aria-label="Tasks" data-testid="tasks-panel">
          <div className="tasks-head">Tasks</div>
          {tasks.length ? ordered(tasks).map((t) => <TaskCard key={t.id} task={t} />) : <p className="tasks-none">No tasks yet.</p>}
        </div>
      )}
    </div>
  )
}
