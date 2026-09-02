import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { supabaseConfigured } from '../lib/supabase'
import { ai } from '../lib/ai'
import { Card, Icon, Screen } from '../ui'

const GROUPS: { title: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    title: 'Plan',
    items: [
      { to: '/more/goals', label: 'Goals', icon: 'weight' },
      { to: '/more/target', label: 'Nutrition target', icon: 'sparkle' },
      { to: '/more/plan', label: 'Workout plans', icon: 'workout' },
      { to: '/physique', label: 'Physique Lab', icon: 'sparkle' },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: '/more/foods', label: 'Food database', icon: 'diet' },
      { to: '/more/recipes', label: 'Quick meals', icon: 'diet' },
      { to: '/adherence', label: 'Monthly adherence', icon: 'today' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/more/settings', label: 'Settings, theme & export', icon: 'gear' },
    ],
  },
]

export default function More() {
  const s = useStore()
  const nav = useNavigate()
  return (
    <Screen title="More" sub="FORGE">
      <Card glass>
        <div className="eyebrow">Profile</div>
        <div className="mt-1 text-[16px] font-extrabold">{s.profile?.display_name || 'Athlete'}</div>
        <div className="text-[12px]" style={{ color: 'var(--text-mute)' }}>
          {s.goal ? `${s.goal.mode.toUpperCase()} · ${s.goal.current_weight_kg} kg → ${s.goal.target_weight_kg} kg` : 'No goal set'}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="raised p-2">
            <div className="eyebrow">Backend</div>
            <div>{supabaseConfigured ? 'Supabase' : 'Local device'}</div>
          </div>
          <div className="raised p-2">
            <div className="eyebrow">AI</div>
            <div>{ai.configured ? 'Configured' : 'Not configured'}</div>
          </div>
        </div>
      </Card>

      {GROUPS.map(g => (
        <div key={g.title} className="mt-4">
          <div className="eyebrow mb-2">{g.title}</div>
          <div className="grid gap-2">
            {g.items.map(i => (
              <Link key={i.to} to={i.to} className="card flex items-center gap-3 p-4">
                <Icon name={i.icon} size={18} />
                <span className="flex-1 text-[14px] font-bold">{i.label}</span>
                <span style={{ color: 'var(--text-mute)' }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-4">
        <Card onClick={() => nav('/progress')}>
          <div className="eyebrow">Insights</div>
          <div className="mt-1 text-[13px]">
            {s.insights.length ? s.insights[0].text : 'AI insights appear here once Gemini is configured and you have a few days of data.'}
          </div>
        </Card>
      </div>
    </Screen>
  )
}
