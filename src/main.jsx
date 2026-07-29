import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App.jsx'
import SyllabusPage from './pages/SyllabusPage.tsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import './index.css'

// BrowserRouter: sob HashRouter o `#` já era a rota, então todo link âncora
// da landing (#lista, #faq…) virava uma rota inexistente e dava tela branca.
// Exige fallback para index.html no host — ver vercel.json / public/_redirects.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/conteudo-programatico" element={<SyllabusPage />} />
        {/* nenhuma URL desconhecida pode virar tela branca */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
