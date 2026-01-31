import React, { useState, useEffect } from 'react'
import WeeklyPlanner from './components/enhanced-WeeklyPlanner.jsx'
import RecipeManager from './components/enhanced-RecipeManager.jsx'
import ShoppingList from './components/enhanced-ShoppingList.jsx'
import Dashboard from './components/Dashboard.jsx'
import Toast from './components/Toast.jsx'
import './styles/design-system.css'

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'planner', label: 'Meal Plan', icon: '🗓️' },
  { id: 'recipes', label: 'Recipes', icon: '👨‍🍳' },
  { id: 'shopping', label: 'Shopping', icon: '🛒' }
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toasts, setToasts] = useState([])
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now()
    const toast = { id, message, type }
    setToasts(prev => [...prev, toast])
    
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
    
    return id
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="bg-primary" style={{ minHeight: '100vh' }}>
      <header className="bg-secondary border-b" style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 16 : 24,
        flexWrap: isMobile ? 'wrap' : 'nowrap'
      }}>
        <h1 className="text-xl font-bold text-accent" style={{ 
          margin: 0, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8 
        }}>
          🍽️ Meal Planner
        </h1>
        
        <nav className={`flex gap-1 ${isMobile ? 'mobile-full' : ''}`} style={{
          flex: isMobile ? '1 1 100%' : 'none',
          marginTop: isMobile ? 8 : 0,
          overflowX: isMobile ? 'auto' : 'visible'
        }}>
          {tabs.map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id)} 
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                fontSize: isMobile ? '12px' : '14px',
                padding: isMobile ? '6px 12px' : '8px 16px',
                minWidth: isMobile ? 'auto' : '100px',
                whiteSpace: 'nowrap'
              }}
            >
              <span className={isMobile ? '' : 'mobile-hidden'}>{tab.icon}</span>
              <span className={isMobile ? 'mobile-hidden' : ''}>{tab.label}</span>
              {isMobile && <span className="text-xs">{tab.label}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ 
        padding: isMobile ? 16 : 24, 
        maxWidth: 1400, 
        margin: '0 auto',
        width: '100%'
      }}>
        {activeTab === 'dashboard' && <Dashboard addToast={addToast} isMobile={isMobile} />}
        {activeTab === 'planner' && <WeeklyPlanner addToast={addToast} isMobile={isMobile} />}
        {activeTab === 'recipes' && <RecipeManager addToast={addToast} isMobile={isMobile} />}
        {activeTab === 'shopping' && <ShoppingList addToast={addToast} isMobile={isMobile} />}
      </main>

      {/* Toast Notifications */}
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1060,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: isMobile ? 'calc(100vw - 32px)' : 400
      }}>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  )
}