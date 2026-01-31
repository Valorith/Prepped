import React, { useState, useEffect, useCallback } from 'react'

const TABS = [
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'categories', label: 'Categories', icon: '📂' },
  { id: 'cuisines', label: 'Cuisines', icon: '🌍' },
  { id: 'random', label: 'Random', icon: '🎲' },
  { id: 'url', label: 'Import URL', icon: '🔗' },
]

export default function DiscoverRecipes({ addToast, isMobile, onClose, onImported }) {
  const [activeTab, setActiveTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [areas, setAreas] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedArea, setSelectedArea] = useState(null)
  const [detailRecipe, setDetailRecipe] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [importingId, setImportingId] = useState(null)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [sourceWarnings, setSourceWarnings] = useState([])

  // Load categories and areas on mount
  useEffect(() => {
    fetch('/api/discover/categories').then(r => r.json()).then(setCategories).catch(() => {})
    fetch('/api/discover/areas').then(r => r.json()).then(setAreas).catch(() => {})
  }, [])

  const search = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setSourceWarnings([])
    try {
      const res = await fetch(`/api/discover/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      const items = data.results || data
      setResults(items)
      if (data.warnings?.length) setSourceWarnings(data.warnings)
      if (!items.length) addToast('No recipes found', 'info')
    } catch { addToast('Search failed', 'error') }
    finally { setLoading(false) }
  }, [searchQuery])

  const getRandom = async () => {
    setLoading(true)
    setSourceWarnings([])
    try {
      const res = await fetch('/api/discover/random')
      const data = await res.json()
      const items = data.results || data
      if (data.warnings?.length) setSourceWarnings(data.warnings)
      if (items.length) {
        // Pick a random one from all sources
        setDetailRecipe(items[Math.floor(Math.random() * items.length)])
      }
    } catch { addToast('Failed to get random recipe', 'error') }
    finally { setLoading(false) }
  }

  const filterByCategory = async (cat) => {
    setSelectedCategory(cat)
    setSelectedArea(null)
    setLoading(true)
    setSourceWarnings([])
    try {
      const res = await fetch(`/api/discover/filter/category/${encodeURIComponent(cat)}`)
      const data = await res.json()
      const items = data.results || data
      setResults(items)
      if (data.warnings?.length) setSourceWarnings(data.warnings)
    } catch { addToast('Failed to load category', 'error') }
    finally { setLoading(false) }
  }

  const filterByArea = async (area) => {
    setSelectedArea(area)
    setSelectedCategory(null)
    setLoading(true)
    setSourceWarnings([])
    try {
      const res = await fetch(`/api/discover/filter/area/${encodeURIComponent(area)}`)
      const data = await res.json()
      const items = data.results || data
      setResults(items)
      if (data.warnings?.length) setSourceWarnings(data.warnings)
    } catch { addToast('Failed to load cuisine', 'error') }
    finally { setLoading(false) }
  }

  const lookupDetail = async (item) => {
    // If item already has full data (spoonacular results), show directly
    if (item.ingredients?.length > 0 || item.source_api === 'spoonacular') {
      setDetailRecipe(item)
      return
    }
    const mealdbId = item.mealdb_id || item
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/discover/lookup/${mealdbId}`)
      setDetailRecipe(await res.json())
    } catch { addToast('Failed to load recipe details', 'error') }
    finally { setDetailLoading(false) }
  }

  const importRecipe = async (recipe) => {
    setImportingId(recipe.mealdb_id || recipe.spoonacular_id || 'url')
    try {
      const payload = { ...recipe }
      delete payload.mealdb_id
      delete payload.spoonacular_id
      delete payload.source_api
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save')
      const saved = await res.json()
      addToast(`"${saved.name}" imported!`, 'success')
      onImported?.(saved)
      setDetailRecipe(null)
    } catch (e) {
      addToast(e.message || 'Import failed', 'error')
    } finally { setImportingId(null) }
  }

  const importFromUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/recipes/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Import failed')
      const parsed = await res.json()
      parsed.import_source = 'url'
      setDetailRecipe(parsed)
      setImportUrl('')
      addToast(`Parsed "${parsed.name}" — review and import!`, 'success')
    } catch (e) {
      addToast(e.message, 'error')
    } finally { setImporting(false) }
  }

  const SourceBadge = ({ source }) => {
    const config = {
      spoonacular: { bg: '#ff6b35', label: '🥄 Spoonacular' },
      themealdb: { bg: '#4ecdc4', label: '🍽️ MealDB' },
      dummyjson: { bg: '#8b5cf6', label: '🧪 DummyJSON' },
      thecocktaildb: { bg: '#f472b6', label: '🍸 CocktailDB' },
    }
    const { bg, label } = config[source] || config.themealdb
    return (
      <span style={{
        display: 'inline-block', fontSize: '0.6rem', fontWeight: 600, padding: '0.15rem 0.4rem',
        borderRadius: '9999px', background: bg, color: '#fff',
        whiteSpace: 'nowrap'
      }}>
        {label}
      </span>
    )
  }

  // Thumbnail card for filter results (minimal data)
  const ThumbCard = ({ item }) => (
    <div className="card" style={{ cursor: 'pointer', padding: '0.75rem', transition: 'all 0.15s' }}
      onClick={() => lookupDetail(item)}>
      {item.image_url && (
        <div style={{ width: '100%', height: 120, borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '0.5rem', background: 'var(--bg-tertiary)' }}>
          <img src={item.image_url + (item.source_api === 'themealdb' || item.source_api === 'thecocktaildb' ? '/preview' : '')} alt={item.name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.25rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{item.name}</div>
        <SourceBadge source={item.source_api || 'themealdb'} />
      </div>
    </div>
  )

  // Full result card (from search — has full data)
  const FullResultCard = ({ recipe }) => (
    <div className="card" style={{ cursor: 'pointer', padding: '0.75rem', transition: 'all 0.15s' }}
      onClick={() => setDetailRecipe(recipe)}>
      {recipe.image_url && (
        <div style={{ width: '100%', height: 130, borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '0.5rem', background: 'var(--bg-tertiary)' }}>
          <img src={recipe.image_url + (recipe.source_api === 'themealdb' || recipe.source_api === 'thecocktaildb' ? '/preview' : '')} alt={recipe.name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', gap: '0.25rem' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{recipe.name}</div>
        <SourceBadge source={recipe.source_api || 'themealdb'} />
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {recipe.cuisine_type && <span>🌍 {recipe.cuisine_type} </span>}
        {recipe.ingredients?.length > 0 && <span>• {recipe.ingredients.length} ingredients</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
        {recipe.tags?.slice(0, 3).map((t, i) => (
          <span key={i} className="tag" style={{ fontSize: '0.6rem' }}>{t}</span>
        ))}
      </div>
    </div>
  )

  // Detail / Preview modal
  const DetailModal = () => {
    if (!detailRecipe) return null
    const r = detailRecipe
    return (
      <div className="modal-overlay" onClick={() => setDetailRecipe(null)} style={{ zIndex: 1100 }}>
        <div className="modal" style={{ width: isMobile ? '100%' : '650px', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</h2>
              {r.description && <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{r.description}</p>}
            </div>
            <button onClick={() => setDetailRecipe(null)} className="btn btn-ghost btn-sm" style={{ fontSize: '1.25rem' }}>✕</button>
          </div>

          {r.image_url && (
            <div style={{ width: '100%', height: 200, borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: '1rem', background: 'var(--bg-tertiary)' }}>
              <img src={r.image_url} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            </div>
          )}

          {/* Source badge */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <span className="meta-chip" style={{ background: { spoonacular: '#ff6b35', dummyjson: '#8b5cf6', thecocktaildb: '#f472b6' }[r.source_api] || 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>
              {{ spoonacular: '🥄 Spoonacular', dummyjson: '🧪 DummyJSON', thecocktaildb: '🍸 CocktailDB' }[r.source_api] || '🍽️ TheMealDB'}
            </span>
            {r.cuisine_type && <span className="meta-chip">🌍 {r.cuisine_type}</span>}
            {r.tags?.slice(0, 4).map((t, i) => <span key={i} className="tag">{t}</span>)}
          </div>

          {/* Ingredients */}
          {r.ingredients?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                📝 Ingredients ({r.ingredients.length})
              </h3>
              <div style={{ display: 'grid', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
                {r.ingredients.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', padding: '0.4rem 0.6rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600, minWidth: 70 }}>{ing.quantity > 0 ? ing.quantity : ''} {ing.unit}</span>
                    <span>{ing.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          {r.instructions && (
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>👨‍🍳 Instructions</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary)', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', maxHeight: 250, overflowY: 'auto' }}>
                {r.instructions}
              </div>
            </div>
          )}

          {/* Import button */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-primary)', paddingTop: '1rem' }}>
            <button onClick={() => setDetailRecipe(null)} className="btn btn-secondary">Cancel</button>
            <button onClick={() => importRecipe(r)} disabled={importingId} className="btn btn-primary">
              {importingId ? '⏳ Importing...' : '📥 Import to My Recipes'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" style={{ width: isMobile ? '100%' : '850px', maxHeight: '90vh', padding: 0 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>🌐 Discover Recipes</h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Browse recipes from multiple sources</p>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ fontSize: '1.25rem' }}>✕</button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setResults([]); setSelectedCategory(null); setSelectedArea(null) }}
                style={{
                  padding: '0.5rem 0.75rem', border: 'none', background: activeTab === tab.id ? 'var(--bg-primary)' : 'transparent',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-muted)',
                  fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0', transition: 'all 0.15s'
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>

          {/* SEARCH TAB */}
          {activeTab === 'search' && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && search()}
                  placeholder="Search recipes (e.g., chicken, pasta, salad)..."
                  className="input" style={{ flex: 1 }} />
                <button onClick={search} disabled={loading || !searchQuery.trim()} className="btn btn-primary">
                  {loading ? '⏳' : '🔍'} Search
                </button>
              </div>
              {sourceWarnings.length > 0 && (
                <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,171,0,0.1)', border: '1px solid rgba(255,171,0,0.3)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  ⚠️ {sourceWarnings.map(w => `${w.source}: ${w.error}`).join(' | ')}
                </div>
              )}
              {results.length > 0 && (
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)' }}>
                  {results.map((r, i) => r.ingredients ? <FullResultCard key={i} recipe={r} /> : <ThumbCard key={i} item={r} />)}
                </div>
              )}
              {!loading && results.length === 0 && searchQuery && (
                <div className="empty-state"><div className="empty-state-icon">🔍</div><div className="empty-state-text">Search for recipes above</div></div>
              )}
            </div>
          )}

          {/* CATEGORIES TAB */}
          {activeTab === 'categories' && (
            <div>
              {!selectedCategory ? (
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
                  {categories.map(cat => (
                    <div key={cat.idCategory} className="card" style={{ cursor: 'pointer', padding: '0.75rem', textAlign: 'center' }}
                      onClick={() => filterByCategory(cat.strCategory)}>
                      <img src={cat.strCategoryThumb} alt={cat.strCategory} style={{ width: 60, height: 60, objectFit: 'contain', margin: '0 auto 0.5rem', display: 'block' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{cat.strCategory}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <button onClick={() => { setSelectedCategory(null); setResults([]) }} className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }}>
                    ← Back to Categories
                  </button>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>📂 {selectedCategory}</h3>
                  {loading ? <div className="empty-state"><div className="loader" style={{ margin: '0 auto', width: 32, height: 32 }}></div></div> : (
                    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)' }}>
                      {results.map((r, i) => <ThumbCard key={i} item={r} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CUISINES TAB */}
          {activeTab === 'cuisines' && (
            <div>
              {!selectedArea ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {areas.map(area => (
                    <button key={area} onClick={() => filterByArea(area)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.85rem' }}>
                      🌍 {area}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <button onClick={() => { setSelectedArea(null); setResults([]) }} className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }}>
                    ← Back to Cuisines
                  </button>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>🌍 {selectedArea} Cuisine</h3>
                  {loading ? <div className="empty-state"><div className="loader" style={{ margin: '0 auto', width: 32, height: 32 }}></div></div> : (
                    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)' }}>
                      {results.map((r, i) => <ThumbCard key={i} item={r} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* RANDOM TAB */}
          {activeTab === 'random' && (
            <div style={{ textAlign: 'center' }}>
              <button onClick={getRandom} disabled={loading} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.75rem 2rem', marginBottom: '1.5rem' }}>
                {loading ? '⏳ Rolling...' : '🎲 Get Random Recipe'}
              </button>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Click to discover a random recipe from thousands of options!</p>
            </div>
          )}

          {/* URL IMPORT TAB */}
          {activeTab === 'url' && (
            <div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>🔗 Import from URL</h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Paste a link from any recipe website. We'll extract the recipe details automatically using JSON-LD structured data.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={importUrl} onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && importFromUrl()}
                  placeholder="https://www.allrecipes.com/recipe/..." className="input" style={{ flex: 1 }} disabled={importing} />
                <button onClick={importFromUrl} disabled={importing || !importUrl.trim()} className="btn btn-primary">
                  {importing ? '⏳ Parsing...' : '🔍 Import'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail modal */}
        {detailLoading && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="loader" style={{ width: 40, height: 40 }}></div>
            </div>
          </div>
        )}
        <DetailModal />
      </div>
    </div>
  )
}
