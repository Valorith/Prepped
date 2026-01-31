import React, { useState, useEffect, useRef } from 'react'
import WeeklyPlanner from './components/enhanced-WeeklyPlanner.jsx'
import RecipeManager from './components/enhanced-RecipeManager.jsx'
import ShoppingList from './components/enhanced-ShoppingList.jsx'
import Dashboard from './components/Dashboard.jsx'
import ApiManager from './components/ApiManager.jsx'
import Toast from './components/Toast.jsx'
import './styles/design-system.css'

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'planner', label: 'Meal Plan', icon: '🗓️' },
  { id: 'recipes', label: 'Recipes', icon: '👨‍🍳' },
  { id: 'shopping', label: 'Shopping', icon: '🛒' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toasts, setToasts] = useState([])
  const [isMobile, setIsMobile] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const switchTab = (tabId) => {
    if (tabId === activeTab) return
    setTransitioning(true)
    setSidebarOpen(false)
    setTimeout(() => {
      setActiveTab(tabId)
      setTimeout(() => setTransitioning(false), 50)
    }, 150)
  }

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) setTimeout(() => removeToast(id), duration)
    return id
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="app-layout">
      {/* Mobile Header */}
      {isMobile && (
        <header className="mobile-header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <span className="hamburger-icon">{sidebarOpen ? '✕' : '☰'}</span>
          </button>
          <h1 className="mobile-title">🍽️ Meal Planner</h1>
        </header>
      )}

      {/* Sidebar Overlay (mobile) */}
      {isMobile && sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobile ? (sidebarOpen ? 'sidebar-open' : 'sidebar-closed') : ''}`}>
        {!isMobile && (
          <div className="sidebar-brand">
            <span className="brand-icon">🍽️</span>
            <span className="brand-text">Meal Planner</span>
          </div>
        )}
        <nav className="sidebar-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`sidebar-link ${activeTab === tab.id ? 'sidebar-link-active' : ''}`}
            >
              <span className="sidebar-icon">{tab.icon}</span>
              <span className="sidebar-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-text">Made with ❤️</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${transitioning ? 'view-exit' : 'view-enter'}`}>
        {activeTab === 'dashboard' && <Dashboard addToast={addToast} isMobile={isMobile} onNavigate={switchTab} />}
        {activeTab === 'planner' && <WeeklyPlanner addToast={addToast} isMobile={isMobile} />}
        {activeTab === 'recipes' && <RecipeManager addToast={addToast} isMobile={isMobile} />}
        {activeTab === 'shopping' && <ShoppingList addToast={addToast} isMobile={isMobile} />}
        {activeTab === 'settings' && <ApiManager addToast={addToast} />}
      </main>

      {/* Toast Notifications */}
      <div className="toast-container">
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
