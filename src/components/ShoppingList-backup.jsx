import React, { useState, useEffect } from 'react'

const CATEGORY_ICONS = {
  produce: '🥬', protein: '🥩', dairy: '🧀', grains: '🌾', canned: '🥫',
  spices: '🧂', condiments: '🫙', frozen: '🧊', other: '📦'
}

export default function ShoppingList() {
  const [items, setItems] = useState([])
  const [newItem, setNewItem] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/shopping').then(r => r.json()).then(setItems)
  }, [])

  const toggle = async (id, checked) => {
    const res = await fetch(`/api/shopping/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !checked })
    })
    const updated = await res.json()
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  const addItem = async () => {
    if (!newItem.trim()) return
    const res = await fetch('/api/shopping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItem.trim() })
    })
    const item = await res.json()
    setItems(prev => [...prev, item])
    setNewItem('')
  }

  const removeItem = async (id) => {
    await fetch(`/api/shopping/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const clearChecked = async () => {
    await fetch('/api/shopping?checked_only=true', { method: 'DELETE' })
    setItems(prev => prev.filter(i => !i.checked))
  }

  const generateFromMeals = async () => {
    setGenerating(true)
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - now.getDay() + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const start = monday.toISOString().split('T')[0]
    const end = sunday.toISOString().split('T')[0]
    
    const res = await fetch('/api/shopping/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end, clear_existing: false })
    })
    const generated = await res.json()
    // Refresh full list
    const all = await fetch('/api/shopping').then(r => r.json())
    setItems(all)
    setGenerating(false)
  }

  // Group by category
  const grouped = {}
  for (const item of items) {
    const cat = item.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  }

  const unchecked = items.filter(i => !i.checked).length
  const total = items.length

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={newItem} onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add item..." style={{ ...inputStyle, flex: 1, minWidth: 200, marginBottom: 0 }}
        />
        <button onClick={addItem} style={primaryBtn}>Add</button>
        <button onClick={generateFromMeals} disabled={generating} style={{ ...primaryBtn, background: '#27ae60' }}>
          {generating ? 'Generating...' : '🛒 Generate from This Week'}
        </button>
        {items.some(i => i.checked) && (
          <button onClick={clearChecked} style={{ ...primaryBtn, background: '#333' }}>Clear Checked</button>
        )}
      </div>

      <div style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        {unchecked} of {total} items remaining
      </div>

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catItems]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#aaa', fontSize: 14, marginBottom: 8, textTransform: 'capitalize' }}>
            {CATEGORY_ICONS[cat] || '📦'} {cat}
          </h3>
          {catItems.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: '#16213e', borderRadius: 6, marginBottom: 4, border: '1px solid #0f3460'
            }}>
              <input type="checkbox" checked={!!item.checked} onChange={() => toggle(item.id, item.checked)}
                style={{ accentColor: '#e94560', width: 18, height: 18, cursor: 'pointer' }} />
              <span style={{
                flex: 1, color: item.checked ? '#555' : '#e0e0e0', fontSize: 14,
                textDecoration: item.checked ? 'line-through' : 'none'
              }}>
                {item.name}
                {item.quantity > 0 && item.unit && <span style={{ color: '#888', marginLeft: 8 }}>{item.quantity} {item.unit}</span>}
              </span>
              <button onClick={() => removeItem(item.id)} style={{
                background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16
              }}>×</button>
            </div>
          ))}
        </div>
      ))}

      {!items.length && <p style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>No items. Add some or generate from your meal plan!</p>}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #0f3460', background: '#1a1a2e', color: '#e0e0e0', fontSize: 14, marginBottom: 10, outline: 'none' }
const primaryBtn = { padding: '8px 20px', border: 'none', borderRadius: 6, background: '#e94560', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }
