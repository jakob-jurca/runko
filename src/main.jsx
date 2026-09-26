import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { routeFailedAuthLink } from './context/AuthContext'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'

routeFailedAuthLink()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
