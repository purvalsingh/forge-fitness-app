import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initNative } from './lib/native'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
void initNative()
