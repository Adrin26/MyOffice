import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Keeps the panels usable if the 3D scene fails (for example when WebGL is unavailable). */
export class SceneErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="absolute inset-0 grid place-items-center bg-slate-950 p-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-black text-rose-300">The 3D office could not be displayed.</p>
          <p className="mt-2 text-sm text-slate-400">
            {this.state.error.message}. The panels, task board and results still work. Check that your browser has WebGL enabled.
          </p>
          <button
            className="mt-4 rounded-xl bg-amber-400 px-4 py-2 font-black text-slate-900 shadow-[0_4px_0_#b45309]"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
