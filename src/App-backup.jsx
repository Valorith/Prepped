import React, { useState } from 'react';
import WeeklyPlanner from './components/WeeklyPlanner.jsx';
import RecipeManager from './components/RecipeManager.jsx';
import ShoppingList from './components/ShoppingList.jsx';
import { ToastContainer } from './hooks/useToast.jsx';

const navigation = [
  { id: 'meal-plan', label: 'Meal Plan', icon: '📅', component: WeeklyPlanner },
  { id: 'recipes', label: 'Recipes', icon: '📝', component: RecipeManager },
  { id: 'shopping', label: 'Shopping List', icon: '🛒', component: ShoppingList },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('meal-plan');

  const ActiveComponent = navigation.find(nav => nav.id === activeTab)?.component || WeeklyPlanner;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header with Navigation */}
      <header style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div className="container">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--spacing-lg) 0',
            gap: 'var(--spacing-2xl)'
          }}>
            {/* Logo */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-md)'
            }}>
              <div style={{
                fontSize: '28px',
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '48px',
                height: '48px'
              }}>
                🍽️
              </div>
              <div>
                <h1 style={{
                  fontSize: 'var(--font-2xl)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0
                }}>
                  Meal Planner
                </h1>
                <p style={{
                  fontSize: 'var(--font-sm)',
                  color: 'var(--text-muted)',
                  margin: 0
                }}>
                  Plan, cook, shop with ease
                </p>
              </div>
            </div>

            {/* Navigation */}
            <nav style={{
              display: 'flex',
              gap: 'var(--spacing-xs)',
              background: 'var(--bg-tertiary)',
              padding: 'var(--spacing-xs)',
              borderRadius: 'var(--radius-lg)'
            }}>
              {navigation.map(nav => (
                <button
                  key={nav.id}
                  onClick={() => setActiveTab(nav.id)}
                  className={activeTab === nav.id ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-lg)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-base)',
                    fontWeight: 500,
                    transition: 'var(--transition-fast)',
                    border: 'none',
                    minWidth: 'auto'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{nav.icon}</span>
                  <span className="nav-label">{nav.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        padding: 'var(--spacing-2xl) 0',
        minHeight: 'calc(100vh - 100px)'
      }}>
        <div className="container">
          <ActiveComponent />
        </div>
      </main>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Responsive Styles */}
      <style jsx>{`
        @media (max-width: 768px) {
          .nav-label {
            display: none;
          }
          
          header > div > div {
            flex-direction: column;
            gap: var(--spacing-lg);
            text-align: center;
          }
          
          nav {
            width: 100%;
            justify-content: center;
          }
          
          nav button {
            flex: 1;
            justify-content: center;
            min-width: 60px;
            padding: var(--spacing-sm);
          }
        }
        
        @media (max-width: 480px) {
          header > div > div > div:first-child {
            flex-direction: row;
            gap: var(--spacing-md);
          }
          
          header > div > div > div:first-child h1 {
            font-size: var(--font-lg);
          }
          
          header > div > div > div:first-child p {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}