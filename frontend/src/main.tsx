import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// No <StrictMode>: its dev-only double mount unmounts the separate React roots that
// drei's <Html> creates mid-render, which leaves the 3D presentation screen empty.
createRoot(document.getElementById('root')!).render(<App />)
