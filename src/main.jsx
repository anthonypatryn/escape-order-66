import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/exo-2/600.css'
import '@fontsource/exo-2/700.css'
import '@fontsource/exo-2/800.css'
import '@fontsource/exo-2/900.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/russo-one'
import './index.css'
import './game/game.css'
import './game/fx.css'
import './game/phone.css'
import App from './App.jsx'
import { unlockAudioOnFirstTap, loadSoundOverrides } from './game/sound'

unlockAudioOnFirstTap()
loadSoundOverrides() // clip settings saved from the sound editor (/?view=sounds)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
