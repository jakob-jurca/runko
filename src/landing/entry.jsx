import React from 'react'
import ReactDOM from 'react-dom/client'
import Landing from './Landing'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

/** Boots the landing page on its own, without the app (see src/main.jsx). */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Landing />
  </React.StrictMode>
)
