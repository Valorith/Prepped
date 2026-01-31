import React, { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api'

export default function ApiManager({ addToast }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState({})
  const [keyInputs, setKeyInputs] = useState({})
  const [showKeys, setShowKeys] = useState({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', base_url: '', api_key: '', icon: '🔌', description: '', free_tier_limit: 0 })

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/api-sources`)
      const data = await res.json()
      setSources(data)
    } catch (e) {
      addToast?.('Failed to load API sources', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchSources() }, [fetchSources])

  const toggleEnabled = async (source) => {
    try {
      const res = await fetch(`${API_BASE}/settings/api-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled })
      })
      const updated = await res.json()
      setSources(prev => prev.map(s => s.id === source.id ? updated : s))
      addToast?.(`${source.name} ${updated.enabled ? 'enabled' : 'disabled'}`, 'success')
    } catch (e) {
      addToast?.('Failed to update source', 'error')
    }
  }

  const saveApiKey = async (source) => {
    const key = keyInputs[source.id]
    if (key === undefined) return
    try {
      const res = await fetch(`${API_BASE}/settings/api-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key })
      })
      const updated = await res.json()
      setSources(prev => prev.map(s => s.id === source.id ? updated : s))
      setKeyInputs(prev => { const n = { ...prev }; delete n[source.id]; return n })
      addToast?.('API key saved', 'success')
    } catch (e) {
      addToast?.('Failed to save API key', 'error')
    }
  }

  const testConnection = async (source) => {
    setTesting(prev => ({ ...prev, [source.id]: true }))
    try {
      const res = await fetch(`${API_BASE}/settings/api-sources/${source.id}/test`, { method: 'POST' })
      const result = await res.json()
      addToast?.(result.message, result.success ? 'success' : 'error')
      fetchSources()
    } catch (e) {
      addToast?.('Test failed', 'error')
    } finally {
      setTesting(prev => ({ ...prev, [source.id]: false }))
    }
  }

  const addSource = async () => {
    if (!newSource.name.trim()) return addToast?.('Name is required', 'error')
    try {
      const res = await fetch(`${API_BASE}/settings/api-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource)
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setSources(prev => [...prev, created])
      setNewSource({ name: '', base_url: '', api_key: '', icon: '🔌', description: '', free_tier_limit: 0 })
      setShowAddForm(false)
      addToast?.('Source added', 'success')
    } catch (e) {
      addToast?.('Failed to add source', 'error')
    }
  }

  const deleteSource = async (source) => {
    try {
      const res = await fetch(`${API_BASE}/settings/api-sources/${source.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setSources(prev => prev.filter(s => s.id !== source.id))
      addToast?.('Source removed', 'success')
    } catch (e) {
      addToast?.(e.message || 'Failed to remove source', 'error')
    }
  }

  const needsKey = (source) => ['spoonacular', 'edamam'].includes(source.id) || (!['themealdb'].includes(source.id) && source.free_tier_limit > 0)

  const getStatusBadge = (source) => {
    if (source.enabled && (!needsKey(source) || source.api_key_set)) return { label: 'Active', color: '#27ae60', icon: '🟢' }
    if (needsKey(source) && !source.api_key_set) return { label: 'No Key', color: '#f39c12', icon: '🟡' }
    return { label: 'Inactive', color: '#e74c3c', icon: '🔴' }
  }

  const getTestBadge = (source) => {
    if (!source.test_status) return null
    if (source.test_status === 'success') return { label: 'Passed', color: '#27ae60' }
    return { label: 'Failed', color: '#e74c3c' }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
      <div style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>Loading API sources...</div>
    </div>
  )

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          ⚙️ API Manager
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 'var(--space-sm) 0 0', fontSize: 'var(--font-size-sm)' }}>
          Manage recipe data sources and API keys
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {sources.map(source => {
          const status = getStatusBadge(source)
          const testBadge = getTestBadge(source)
          const isEditing = keyInputs[source.id] !== undefined

          return (
            <div key={source.id} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-xl)',
              transition: 'all var(--transition-normal)',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(233,69,96,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <span style={{ fontSize: '2rem' }}>{source.icon}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>{source.name}</h3>
                      <span style={{
                        fontSize: 'var(--font-size-xs)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: `${status.color}22`,
                        color: status.color,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {status.icon} {status.label}
                      </span>
                      {testBadge && (
                        <span style={{
                          fontSize: 'var(--font-size-xs)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: `${testBadge.color}22`,
                          color: testBadge.color,
                          fontWeight: 500
                        }}>
                          Test: {testBadge.label}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {source.description}
                    </p>
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleEnabled(source)}
                  style={{
                    width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: source.enabled ? 'var(--color-success)' : 'var(--border-primary)',
                    position: 'relative', transition: 'background var(--transition-normal)', flexShrink: 0
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: source.enabled ? 25 : 3,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left var(--transition-normal)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }} />
                </button>
              </div>

              {/* API Key section */}
              {needsKey(source) && (
                <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)' }}>
                  <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    API Key {source.id === 'edamam' && <span style={{ fontWeight: 400, textTransform: 'none' }}>(format: app_id|app_key)</span>}
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)', alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        type={showKeys[source.id] ? 'text' : 'password'}
                        placeholder={source.api_key_set ? source.api_key : 'Enter API key...'}
                        value={keyInputs[source.id] ?? ''}
                        onChange={e => setKeyInputs(prev => ({ ...prev, [source.id]: e.target.value }))}
                        style={{
                          width: '100%', padding: '8px 36px 8px 12px', background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)',
                          color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none',
                          fontFamily: 'monospace'
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border-secondary)'}
                      />
                      <button
                        onClick={() => setShowKeys(prev => ({ ...prev, [source.id]: !prev[source.id] }))}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px',
                          color: 'var(--text-muted)', padding: 2
                        }}
                        title={showKeys[source.id] ? 'Hide' : 'Show'}
                      >
                        {showKeys[source.id] ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                    {isEditing && (
                      <button
                        onClick={() => saveApiKey(source)}
                        style={{
                          padding: '8px 16px', background: 'var(--color-primary)', color: '#fff',
                          border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          fontSize: 'var(--font-size-sm)', fontWeight: 600, whiteSpace: 'nowrap',
                          transition: 'background var(--transition-fast)'
                        }}
                        onMouseEnter={e => e.target.style.background = 'var(--color-primary-hover)'}
                        onMouseLeave={e => e.target.style.background = 'var(--color-primary)'}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Footer: Usage + Test + Delete */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-md)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                {/* Usage bar */}
                {source.free_tier_limit > 0 ? (
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>Requests today</span>
                      <span>{source.requests_today || 0} / {source.free_tier_limit}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3, transition: 'width var(--transition-slow)',
                        width: `${Math.min(((source.requests_today || 0) / source.free_tier_limit) * 100, 100)}%`,
                        background: (source.requests_today || 0) / source.free_tier_limit > 0.8 ? 'var(--color-danger)' : 'var(--color-primary)'
                      }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    {source.id === 'themealdb' ? '♾️ Unlimited requests' : ''}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {source.last_tested && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', alignSelf: 'center' }}>
                      Last tested: {new Date(source.last_tested).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => testConnection(source)}
                    disabled={testing[source.id]}
                    style={{
                      padding: '6px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)',
                      cursor: testing[source.id] ? 'wait' : 'pointer', fontSize: 'var(--font-size-sm)',
                      transition: 'all var(--transition-fast)', display: 'flex', alignItems: 'center', gap: 6,
                      opacity: testing[source.id] ? 0.7 : 1
                    }}
                    onMouseEnter={e => { if (!testing[source.id]) e.target.style.borderColor = 'var(--color-primary)' }}
                    onMouseLeave={e => e.target.style.borderColor = 'var(--border-secondary)'}
                  >
                    {testing[source.id] ? '⏳' : '🔌'} Test
                  </button>
                  {!['themealdb', 'spoonacular', 'edamam'].includes(source.id) && (
                    <button
                      onClick={() => deleteSource(source)}
                      style={{
                        padding: '6px 10px', background: 'transparent', color: 'var(--color-danger)',
                        border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)',
                        cursor: 'pointer', fontSize: 'var(--font-size-sm)', transition: 'all var(--transition-fast)'
                      }}
                      onMouseEnter={e => { e.target.style.background = 'var(--color-danger)'; e.target.style.color = '#fff' }}
                      onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--color-danger)' }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Add Custom Source */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: 'var(--space-lg)', background: 'transparent', border: '2px dashed var(--border-secondary)',
              borderRadius: 'var(--radius-xl)', cursor: 'pointer', color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 'var(--space-sm)', transition: 'all var(--transition-normal)'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            ➕ Add Custom API Source
          </button>
        ) : (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-xl)'
          }}>
            <h3 style={{ margin: '0 0 var(--space-lg)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
              Add Custom Source
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              {[
                { label: 'Name', key: 'name', placeholder: 'My Recipe API', span: false },
                { label: 'Icon', key: 'icon', placeholder: '🔌', span: false },
                { label: 'Base URL', key: 'base_url', placeholder: 'https://api.example.com', span: true },
                { label: 'API Key', key: 'api_key', placeholder: 'Optional', span: false },
                { label: 'Daily Limit', key: 'free_tier_limit', placeholder: '0 = unlimited', type: 'number', span: false },
                { label: 'Description', key: 'description', placeholder: 'Describe this API source...', span: true }
              ].map(field => (
                <div key={field.key} style={{ gridColumn: field.span ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type || 'text'}
                    placeholder={field.placeholder}
                    value={newSource[field.key]}
                    onChange={e => setNewSource(prev => ({ ...prev, [field.key]: field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-primary)',
                      border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none', marginTop: 4
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border-secondary)'}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: '8px 20px', background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontSize: 'var(--font-size-sm)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={addSource}
                style={{
                  padding: '8px 20px', background: 'var(--color-primary)', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)', fontWeight: 600
                }}
              >
                Add Source
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
