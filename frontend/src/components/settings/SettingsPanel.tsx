import { useState } from 'react'
import { Save } from 'lucide-react'
import { useWorkplace } from '../../stores/workplaceStore'
import { api, errorMessage } from '../../services/api'
import { Button, Field, PanelHeader, inputClass } from '../ui'

export function SettingsPanel() {
  const appSettings = useWorkplace((s) => s.appSettings)
  const setAppSettings = useWorkplace((s) => s.setAppSettings)
  const prefs = useWorkplace((s) => s.prefs)
  const setPrefs = useWorkplace((s) => s.setPrefs)
  const health = useWorkplace((s) => s.health)
  const toast = useWorkplace((s) => s.toast)
  const [topic, setTopic] = useState(appSettings.default_topic)

  const save = async (patch: Partial<typeof appSettings>) => {
    try {
      setAppSettings(await api.updateSettings(patch))
      toast({ level: 'success', title: 'Settings saved' })
    } catch (e) {
      toast({ level: 'error', title: 'Could not save settings', message: errorMessage(e) })
    }
  }

  return (
    <div>
      <PanelHeader title="Settings" subtitle="Project settings are stored in the backend; display preferences in this browser." />
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="font-black text-white">Project</h3>
          <Field label="Default research topic" htmlFor="s-topic" hint="Pre-fills the Start dialog.">
            <div className="flex gap-2">
              <input id="s-topic" className={inputClass} value={topic} maxLength={500} onChange={(e) => setTopic(e.target.value)} />
              <Button variant="primary" onClick={() => save({ default_topic: topic })}><Save className="h-4 w-4" /></Button>
            </div>
          </Field>
          <Toggle label="Automatically present findings when a run finishes" checked={appSettings.auto_present}
            onChange={(v) => save({ auto_present: v })} />
        </section>
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="font-black text-white">Display</h3>
          <Toggle label="Shadows (turn off on slower computers)" checked={prefs.shadows} onChange={(v) => setPrefs({ shadows: v })} />
          <Toggle label="Reduce avatar motion" checked={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
          <Toggle label="Show floating name tags" checked={prefs.showLabels} onChange={(v) => setPrefs({ showLabels: v })} />
        </section>
        <section className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm lg:col-span-2">
          <h3 className="font-black text-white">Backend</h3>
          {health ? (
            <ul className="space-y-1 text-slate-300">
              <li>Status: <strong className="text-white">{health.status}</strong> · API v{health.version} · CrewAI {health.crewai_version} · schema v{health.schema_version}</li>
              <li>OpenAI key configured: <strong className={health.openai_key_configured ? 'text-emerald-300' : 'text-rose-300'}>{health.openai_key_configured ? 'yes' : 'no'}</strong> (the key itself never leaves the backend)</li>
              <li>Local Ollama models: <strong className={health.ollama_available ? 'text-emerald-300' : 'text-slate-400'}>{health.ollama_available ? 'available' : 'Ollama not running'}</strong></li>
              <li>Pause is not offered: CrewAI's kickoff cannot be paused or safely cancelled once started.</li>
            </ul>
          ) : <p className="text-slate-400">Backend not reachable.</p>}
        </section>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-slate-200">
      {label}
      <input type="checkbox" role="switch" className="h-5 w-5 accent-amber-400" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
