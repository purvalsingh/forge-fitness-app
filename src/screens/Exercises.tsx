import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { loadExercises, searchExercises, type LibExercise } from '../lib/exercises'
import { bestE1rm, e1rm, exerciseHistory, working } from '../lib/training'
import { Button, Field, Icon, Screen, Sheet, Spinner } from '../ui'
import type { Exercise } from '../lib/types'

const MUSCLES = ['chest', 'back', 'shoulders', 'upper arms', 'lower arms', 'upper legs', 'lower legs', 'waist', 'cardio']
const EQUIP = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'ez bar', 'smith machine']

/** The exercise library: search, filter by body part and equipment you own, favourites, your own exercises. */
export default function Exercises() {
  const s = useStore()
  const nav = useNavigate()
  const [lib, setLib] = useState<LibExercise[] | null>(null)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equip, setEquip] = useState('')
  const [open, setOpen] = useState<LibExercise | null>(null)
  const [create, setCreate] = useState(false)
  useEffect(() => { void loadExercises().then(setLib).catch(() => setLib([])) }, [])

  const favs = useMemo(() => new Set(s.customExercises.filter(e => e.favorite).map(e => e.id)), [s.customExercises])
  const mine = s.customExercises.filter(e => e.custom) as LibExercise[]
  const all = useMemo(() => [...mine, ...(lib ?? [])], [mine, lib])
  const list = useMemo(() => searchExercises(all, q, { muscle: muscle || undefined, equipment: equip || undefined }, favs).slice(0, 150), [all, q, muscle, equip, favs])

  return (
    <Screen title="Exercises" sub={`${all.length.toLocaleString()} in library`} back={() => nav(-1)}
      right={<button className="chip press" onClick={() => setCreate(true)}>+ Mine</button>}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
      <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1">
        {MUSCLES.map(m => <button key={m} className="chip press shrink-0" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)}>{m}</button>)}
      </div>
      <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1">
        {EQUIP.map(m => <button key={m} className="chip press shrink-0" aria-pressed={equip === m} onClick={() => setEquip(equip === m ? '' : m)}>{m}</button>)}
      </div>
      {!lib && <Spinner label="Loading library" />}
      <div className="mt-3 grid gap-1.5">
        {list.map(x => (
          <button key={x.id} onClick={() => setOpen(x)} className="cv card press flex items-center justify-between gap-2 p-3 text-left">
            <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{x.name}</span>
              <span className="mono block text-[11px]" style={{ color: 'var(--text-mute)' }}>{x.muscle} · {x.equipment}{x.custom ? ' · mine' : ''}</span></span>
            {favs.has(x.id) && <span style={{ color: 'var(--accent)' }}><Icon name="star" size={16} /></span>}
          </button>
        ))}
      </div>
      <Detail ex={open} onClose={() => setOpen(null)} fav={open ? favs.has(open.id) : false} />
      <CreateExercise open={create} onClose={() => setCreate(false)} />
    </Screen>
  )
}

function Detail({ ex, onClose, fav }: { ex: LibExercise | null; onClose: () => void; fav: boolean }) {
  const s = useStore()
  const [hi, setHi] = useState(false)
  if (!ex) return null
  const hist = exerciseHistory(s.sessions, ex.id).slice(0, 8)
  const best = bestE1rm(s.sessions, ex.id, '9999-12-31')
  const steps = (hi && ex.steps_hi?.length ? ex.steps_hi : ex.steps) ?? []
  return (
    <Sheet open onClose={onClose} title={ex.name}>
      <div className="grid gap-3">
        <div className="mono text-[12px]" style={{ color: 'var(--text-mute)' }}>
          {ex.muscle}{ex.secondary?.length ? ` + ${ex.secondary.join(', ')}` : ''} · {ex.equipment}{ex.per_side ? ' · per side' : ''}
        </div>
        <div className="flex gap-2">
          <button className="chip press" aria-pressed={fav} onClick={() => void s.save('exercises', { ...ex, steps: undefined, steps_hi: undefined, favorite: !fav, custom: ex.custom ?? false } as never)}>
            <Icon name="star" size={14} /> {fav ? 'Favourite' : 'Add to favourites'}
          </button>
          {ex.steps_hi?.length ? <button className="chip press" aria-pressed={hi} onClick={() => setHi(v => !v)}>हिन्दी</button> : null}
        </div>
        {best > 0 && <div className="raised p-3"><div className="eyebrow">Best estimated 1RM</div><div className="figure text-[24px]">{best} kg</div></div>}
        {steps.length > 0 && (
          <ol className="grid list-decimal gap-1.5 pl-5 text-[13px]" style={{ color: 'var(--text-dim)' }}>
            {steps.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
        )}
        {hist.length > 0 && (
          <div>
            <div className="eyebrow mb-1">History</div>
            <div className="grid gap-1">
              {hist.map(h => (
                <div key={h.date} className="mono flex justify-between text-[12px]">
                  <span>{h.date}</span>
                  <span style={{ color: 'var(--text-mute)' }}>{working(h.ex.sets).map(x => `${x.weight_kg ?? 'BW'}×${x.reps ?? '-'}`).join('  ')}</span>
                  <span>{Math.max(0, ...working(h.ex.sets).map(x => e1rm(x.weight_kg, x.reps) ?? 0)) || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {ex.custom && <Button variant="danger" onClick={() => { void s.del('exercises', ex.id); onClose() }}>Delete my exercise</Button>}
      </div>
    </Sheet>
  )
}

function CreateExercise({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const [f, setF] = useState<Partial<Exercise>>({ name: '', body_part: 'chest', equipment: 'dumbbell', kind: 'weight_reps' })
  return (
    <Sheet open={open} onClose={onClose} title="Your own exercise">
      <div className="grid gap-3">
        <Field label="Name"><input maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Landmine press" /></Field>
        <Field label="Body part"><select value={f.body_part} onChange={e => setF({ ...f, body_part: e.target.value, muscle: e.target.value })}>{MUSCLES.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Equipment"><select value={f.equipment} onChange={e => setF({ ...f, equipment: e.target.value })}>{EQUIP.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Logged as">
          <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as Exercise['kind'] })}>
            <option value="weight_reps">Weight × reps</option><option value="bodyweight_reps">Bodyweight reps</option>
            <option value="timed">Time (hold)</option><option value="cardio">Cardio (time + distance)</option>
          </select>
        </Field>
        <Button disabled={!f.name?.trim()} onClick={() => {
          void s.save('exercises', { ...f, id: 'my-' + crypto.randomUUID().slice(0, 8), name: f.name!.trim(), muscle: f.muscle ?? f.body_part, custom: true } as never)
          onClose()
        }}>Save exercise</Button>
      </div>
    </Sheet>
  )
}
