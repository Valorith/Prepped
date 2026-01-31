import React, { useState, useEffect, useMemo } from 'react'

export default function ShoppingList({ addToast, isMobile }) {
  const [items, setItems] = useState([])
  const [aisles, setAisles] = useState([])
  const [newItem, setNewItem] = useState({ name: '', aisle_id: 'other' })
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ search: '', aisle: '', show_checked: true })
  const [viewMode, setViewMode] = useState('aisles')
  const [collapsedAisles, setCollapsedAisles] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [itemsRes, aislesRes] = await Promise.all([fetch('/api/shopping'), fetch('/api/grocery-aisles')])
      setItems(await itemsRes.json())
      setAisles(await aislesRes.json())
    } catch { addToast('Failed to load shopping list', 'error') }
    finally { setLoading(false) }
  }

  const toggle = async (id, checked) => {
    try {
      const res = await fetch(`/api/shopping/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: !checked })
      })
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    } catch { addToast('Failed to update item', 'error') }
  }

  const addItem = async () => {
    if (!newItem.name.trim()) { addToast('Name required', 'error'); return }
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newItem.name.trim(), aisle_id: newItem.aisle_id })
      })
      const item = await res.json()
      setItems(prev => [...prev, item])
      setNewItem({ name: '', aisle_id: 'other' })
      addToast('Item added!', 'success')
    } catch { addToast('Failed to add item', 'error') }
  }

  const removeItem = async (id) => {
    try {
      await fetch(`/api/shopping/${id}`, { method: 'DELETE' })
      setItems(prev => prev.filter(i => i.id !== id))
    } catch { addToast('Failed to remove item', 'error') }
  }

  const clearChecked = async () => {
    if (!window.confirm('Remove all checked items?')) return
    try {
      await fetch('/api/shopping?checked_only=true', { method: 'DELETE' })
      setItems(prev => prev.filter(i => !i.checked))
      addToast('Cleared!', 'success')
    } catch { addToast('Failed to clear', 'error') }
  }

  const clearAll = async () => {
    if (!window.confirm('Clear entire shopping list? This cannot be undone.')) return
    try {
      await fetch('/api/shopping?all=true', { method: 'DELETE' })
      setItems([])
      addToast('Shopping list cleared!', 'success')
    } catch { addToast('Failed to clear', 'error') }
  }

  const generateFromMeals = async () => {
    try {
      setGenerating(true)
      const now = new Date()
      const monday = new Date(now); monday.setDate(now.getDate() - now.getDay() + 1)
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      const res = await fetch('/api/shopping/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0], clear_existing: false })
      })
      const result = await res.json()
      setItems(result.items || [])
      addToast(`${result.added_count} items added from meal plan!`, 'success')
    } catch { addToast('Failed to generate', 'error') }
    finally { setGenerating(false) }
  }

  const moveItemToAisle = async (itemId, aisleId) => {
    try {
      const res = await fetch(`/api/shopping/${itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aisle_id: aisleId })
      })
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    } catch { addToast('Failed to move item', 'error') }
  }

  const toggleAisle = (aisleId) => {
    setCollapsedAisles(prev => ({ ...prev, [aisleId]: !prev[aisleId] }))
  }

  const filteredItems = useMemo(() => {
    let result = items
    if (filters.search) {
      const s = filters.search.toLowerCase()
      result = result.filter(item => item.name.toLowerCase().includes(s))
    }
    if (filters.aisle) result = result.filter(item => item.aisle_id === filters.aisle)
    if (!filters.show_checked) result = result.filter(item => !item.checked)
    return result
  }, [items, filters])

  const groupedByAisle = useMemo(() => {
    const grouped = {}
    for (const aisle of aisles) {
      grouped[aisle.id] = { ...aisle, items: filteredItems.filter(item => item.aisle_id === aisle.id) }
    }
    const orphans = filteredItems.filter(item => !aisles.some(a => a.id === item.aisle_id))
    if (orphans.length > 0) {
      if (!grouped.other) grouped.other = { id: 'other', name: 'Other', icon: '📦', sort_order: 999, items: [] }
      grouped.other.items = [...(grouped.other.items || []), ...orphans]
    }
    return Object.values(grouped).filter(a => a.items.length > 0).sort((a, b) => a.sort_order - b.sort_order)
  }, [filteredItems, aisles])

  const stats = useMemo(() => {
    const total = items.length, checked = items.filter(i => i.checked).length
    return { total, checked, unchecked: total - checked, pct: total ? Math.round(checked / total * 100) : 0 }
  }, [items])

  const ShoppingItem = ({ item, showAisle = false }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.6rem 0.75rem', background: item.checked ? 'transparent' : 'var(--bg-secondary)',
      borderRadius: 'var(--radius-md)', border: `1px solid ${item.checked ? 'var(--border-primary)' : 'var(--border-secondary)'}`,
      marginBottom: '0.35rem', transition: 'all 0.2s ease',
      opacity: item.checked ? 0.6 : 1
    }}>
      <input type="checkbox" checked={!!item.checked} onChange={() => toggle(item.id, item.checked)}
        style={{ accentColor: 'var(--color-primary)', width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          color: item.checked ? 'var(--text-disabled)' : 'var(--text-primary)',
          textDecoration: item.checked ? 'line-through' : 'none',
          fontSize: '0.9rem', fontWeight: item.checked ? 400 : 500
        }}>{item.name}</span>
        {item.quantity > 0 && item.unit && (
          <span className="text-muted" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>{item.quantity} {item.unit}</span>
        )}
        {showAisle && item.aisle_name && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.aisle_icon} {item.aisle_name}</div>
        )}
      </div>
      {viewMode === 'aisles' && (
        <select value={item.aisle_id || 'other'} onChange={(e) => moveItemToAisle(item.id, e.target.value)}
          className="input select" style={{ width: 'auto', minWidth: 110, fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}>
          {aisles.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>
      )}
      <button onClick={() => removeItem(item.id)} className="btn btn-ghost btn-sm text-danger"
        style={{ padding: '0.2rem', minHeight: 'auto', fontSize: '0.8rem', flexShrink: 0 }}>×</button>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'mobile-stack' : ''}`} style={{ marginBottom: '1.25rem', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>🛒 Shopping List</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {stats.unchecked} item{stats.unchecked !== 1 ? 's' : ''} remaining
            {stats.checked > 0 && ` • ${stats.checked} done`}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <button onClick={() => setViewMode(viewMode === 'aisles' ? 'list' : 'aisles')} className="btn btn-secondary btn-sm">
            {viewMode === 'aisles' ? '📋 List' : '🏬 Aisles'}
          </button>
          <button onClick={() => window.print()} className="btn btn-secondary btn-sm no-print">🖨️ Print</button>
        </div>
      </div>

      {/* Progress Bar */}
      {stats.total > 0 && (
        <div style={{ marginBottom: '1rem' }} className="no-print">
          <div className="progress-bar" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${stats.pct}%`, background: stats.pct === 100 ? 'var(--color-success)' : 'var(--color-primary)' }}></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{stats.pct}% complete</span>
            {stats.checked > 0 && (
              <button onClick={clearChecked} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Clear completed
              </button>
            )}
            <button onClick={clearAll} style={{ fontSize: '0.7rem', color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Add Item & Controls */}
      <div className="card no-print" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr auto', marginBottom: '0.75rem' }}>
          <input value={newItem.name} onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addItem()} placeholder="Add item..." className="input" />
          <select value={newItem.aisle_id} onChange={(e) => setNewItem(prev => ({ ...prev, aisle_id: e.target.value }))} className="input select">
            {aisles.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
          <button onClick={addItem} className="btn btn-primary">Add</button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Search items..." value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="input" style={{ flex: 1, minWidth: 150 }} />
          <select value={filters.aisle} onChange={(e) => setFilters(f => ({ ...f, aisle: e.target.value }))} className="input select" style={{ minWidth: 140 }}>
            <option value="">All Aisles</option>
            {aisles.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={filters.show_checked} onChange={(e) => setFilters(f => ({ ...f, show_checked: e.target.checked }))}
              style={{ accentColor: 'var(--color-primary)' }} /> Show done
          </label>
          <button onClick={generateFromMeals} disabled={generating} className="btn btn-success btn-sm">
            {generating ? '⏳' : '🗓️'} From Meals
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="empty-state">
          <div className="loader" style={{ margin: '0 auto 1rem', width: 32, height: 32 }}></div>
          <p className="text-secondary">Loading...</p>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {viewMode === 'aisles' ? (
            groupedByAisle.length > 0 ? groupedByAisle.map(aisle => {
              const checkedCount = aisle.items.filter(i => i.checked).length
              const collapsed = collapsedAisles[aisle.id]
              return (
                <div key={aisle.id} className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem' }}>
                  <div onClick={() => toggleAisle(aisle.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: collapsed ? 0 : '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{aisle.icon}</span>
                      <span style={{ fontWeight: 600, fontSize: '1rem' }}>{aisle.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ({aisle.items.length - checkedCount} remaining)
                      </span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
                  </div>
                  {!collapsed && aisle.items.map(item => <ShoppingItem key={item.id} item={item} />)}
                </div>
              )
            }) : (
              <div className="empty-state">
                <div className="empty-state-icon">🛒</div>
                <div className="empty-state-title">Shopping list is empty</div>
                <div className="empty-state-text">Add items manually or generate from your meal plan!</div>
              </div>
            )
          ) : (
            <div className="card">
              <h3 style={{ margin: 0, marginBottom: '0.75rem', fontWeight: 600 }}>All Items ({filteredItems.length})</h3>
              {filteredItems.length > 0 ? filteredItems.map(item => (
                <ShoppingItem key={item.id} item={item} showAisle />
              )) : (
                <div className="text-center text-muted" style={{ padding: '2rem' }}>No items match filters</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Print-only view */}
      <div className="print-only" style={{ display: 'none' }}>
        <h2 style={{ marginBottom: '1rem' }}>🛒 Shopping List</h2>
        {groupedByAisle.map(aisle => (
          <div key={aisle.id} style={{ marginBottom: '1rem' }}>
            <h3 style={{ borderBottom: '1px solid #ccc', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
              {aisle.icon} {aisle.name}
            </h3>
            <div className="shopping-print-list">
              {aisle.items.filter(i => !i.checked).map(item => (
                <div key={item.id} className="shopping-print-item">
                  <div className="shopping-print-checkbox"></div>
                  <span>{item.name}{item.quantity > 0 && item.unit ? ` — ${item.quantity} ${item.unit}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .card { border: none !important; padding: 0 !important; background: transparent !important; }
          .card:hover { background: transparent !important; }
          .progress-bar { display: none !important; }
        }
      `}</style>
    </div>
  )
}
