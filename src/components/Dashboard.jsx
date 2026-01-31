import React, { useState, useEffect } from 'react'

const Dashboard = ({ addToast, isMobile, onNavigate }) => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadStats() }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/stats')
      if (!response.ok) throw new Error('Failed to load stats')
      setStats(await response.json())
    } catch (err) {
      setError(err.message)
      addToast('Failed to load dashboard stats', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loader" style={{ margin: '0 auto 1rem', width: 32, height: 32 }}></div>
        <p className="text-secondary">Loading dashboard...</p>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">😵</div>
        <div className="empty-state-title">Failed to load dashboard</div>
        <button onClick={loadStats} className="btn btn-primary" style={{ marginTop: '1rem' }}>Try Again</button>
      </div>
    )
  }

  const StatCard = ({ title, value, icon, color }) => (
    <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
      <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>{icon}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, marginBottom: '0.15rem', lineHeight: 1.2 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-secondary" style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className="text-2xl font-bold text-primary" style={{ margin: 0, marginBottom: '0.25rem' }}>Dashboard</h2>
          <p className="text-sm text-muted" style={{ margin: 0 }}>Your meal planning overview</p>
        </div>
        <button onClick={loadStats} className="btn btn-ghost btn-sm">🔄 Refresh</button>
      </div>

      <div className="grid gap-lg" style={{
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        marginBottom: '2rem'
      }}>
        <StatCard title="Recipes" value={stats.total_recipes} icon="👨‍🍳" color="var(--color-primary)" />
        <StatCard title="Favorites" value={stats.favorite_recipes} icon="❤️" color="var(--color-danger)" />
        <StatCard title="Planned" value={stats.total_meals_planned} icon="🗓️" color="var(--color-success)" />
        <StatCard title="Avg Rating" value={stats.avg_recipe_rating.toFixed(1)} icon="⭐" color="var(--rating-star)" />
      </div>

      <div className="grid gap-lg" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3 className="text-lg font-semibold" style={{ marginBottom: '1rem' }}>🔥 Popular Recipes</h3>
          {stats.popular_recipes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {stats.popular_recipes.slice(0, 8).map((r, i) => (
                <div key={r.id} className="flex items-center gap-md" style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <span className="text-xs text-muted font-bold" style={{ width: 20 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted">Used {r.usage_count}×</div>
                  </div>
                  {r.rating > 0 && <span className="text-sm" style={{ color: 'var(--rating-star)' }}>⭐ {r.rating.toFixed(1)}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <div className="empty-state-icon">🍳</div>
              <div className="empty-state-text">Start planning meals to see popular recipes</div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold" style={{ marginBottom: '1rem' }}>📈 Recent Activity</h3>
          {stats.recent_activity.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {stats.recent_activity.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-center gap-md" style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <span style={{ fontSize: '1.1rem' }}>{a.type === 'meal' ? '🗓️' : '👨‍🍳'}</span>
                  <div style={{ flex: 1 }}>
                    <div className="text-sm font-medium">{a.name || 'Untitled'}</div>
                    <div className="text-xs text-muted">{a.extra || ''}</div>
                  </div>
                  <span className="text-xs text-muted">{new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">No recent activity yet</div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="text-lg font-semibold" style={{ marginBottom: '1rem' }}>⚡ Quick Actions</h3>
        <div className="grid gap-md" style={{ gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
          <button className="btn btn-primary btn-lg" onClick={() => onNavigate?.('recipes')} style={{ flexDirection: 'column', gap: 4 }}>
            <span>➕</span><span className="text-xs">New Recipe</span>
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => onNavigate?.('planner')} style={{ flexDirection: 'column', gap: 4 }}>
            <span>🗓️</span><span className="text-xs">Plan Meals</span>
          </button>
          <button className="btn btn-success btn-lg" onClick={() => onNavigate?.('shopping')} style={{ flexDirection: 'column', gap: 4 }}>
            <span>🛒</span><span className="text-xs">Shopping List</span>
          </button>
          <button className="btn btn-ghost btn-lg" onClick={loadStats} style={{ flexDirection: 'column', gap: 4 }}>
            <span>🔄</span><span className="text-xs">Refresh</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
