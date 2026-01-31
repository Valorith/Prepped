import React, { useState, useEffect, useMemo } from 'react'

const RECIPE_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'appetizer']
const CUISINES = ['', 'american', 'italian', 'mexican', 'asian', 'indian', 'mediterranean', 'french', 'chinese', 'thai', 'japanese', 'korean', 'greek', 'spanish', 'other']
const DIFFICULTIES = ['easy', 'medium', 'hard']
const AISLE_CATEGORIES = ['produce', 'meat', 'dairy', 'pantry', 'grains', 'condiments', 'spices', 'frozen', 'other']

export default function RecipeManager({ addToast, isMobile }) {
  const [recipes, setRecipes] = useState([])
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null) // recipe detail view
  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    search: '', category: '', cuisine: '', difficulty: '',
    max_time: '', min_rating: '', favorites_only: false,
    recipe_type: '', sort: 'name', order: 'asc'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState(isMobile ? 'list' : 'grid')
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)

  function emptyForm() {
    return { 
      name: '', description: '', servings: 4, prep_time: 0, cook_time: 0, 
      instructions: '', tags: [], ingredients: [], calories: 0, protein: 0, 
      carbs: 0, fat: 0, difficulty: 'medium', cuisine_type: '', recipe_type: 'dinner',
      source_url: '', image_url: ''
    }
  }

  useEffect(() => { loadRecipes() }, [filters])

  const loadRecipes = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== false) params.append(key, value)
      })
      const response = await fetch(`/api/recipes?${params}`)
      if (!response.ok) throw new Error('Failed to load recipes')
      setRecipes(await response.json())
    } catch (error) {
      addToast('Failed to load recipes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => { setForm(emptyForm()); setEditing('new') }
  const openEdit = (r) => { setForm({ ...r, tags: r.tags || [] }); setEditing(r.id) }

  const save = async () => {
    try {
      if (!form.name.trim()) { addToast('Recipe name is required', 'error'); return }
      setLoading(true)
      const method = editing === 'new' ? 'POST' : 'PUT'
      const url = editing === 'new' ? '/api/recipes' : `/api/recipes/${editing}`
      const payload = {
        ...form, name: form.name.trim(),
        tags: Array.isArray(form.tags) ? form.tags : [],
        ingredients: form.ingredients.filter(ing => ing.name && ing.name.trim())
      }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error((await res.json()).message || 'Failed to save')
      const saved = await res.json()
      if (editing === 'new') {
        setRecipes(prev => [...prev, saved])
        addToast('Recipe created!', 'success')
      } else {
        setRecipes(prev => prev.map(r => r.id === saved.id ? saved : r))
        addToast('Recipe updated!', 'success')
      }
      setEditing(null)
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this recipe?')) return
    try {
      await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
      setRecipes(prev => prev.filter(r => r.id !== id))
      if (viewing?.id === id) setViewing(null)
      addToast('Recipe deleted', 'success')
    } catch { addToast('Failed to delete recipe', 'error') }
  }

  const toggleFavorite = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}/favorite`, { method: 'POST' })
      const { is_favorite } = await res.json()
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, is_favorite: is_favorite ? 1 : 0 } : r))
      if (viewing?.id === id) setViewing(v => ({ ...v, is_favorite: is_favorite ? 1 : 0 }))
    } catch { addToast('Failed to update favorite', 'error') }
  }

  const addRating = async (id, rating) => {
    try {
      const res = await fetch(`/api/recipes/${id}/rate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      })
      const { rating: newRating, rating_count } = await res.json()
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, rating: newRating, rating_count } : r))
      if (viewing?.id === id) setViewing(v => ({ ...v, rating: newRating, rating_count }))
      addToast('Rating added!', 'success')
    } catch { addToast('Failed to add rating', 'error') }
  }

  const importFromUrl = async () => {
    if (!importUrl.trim()) { addToast('Enter a URL', 'error'); return }
    try {
      setImporting(true)
      const res = await fetch('/api/recipes/import-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Import failed')
      const parsed = await res.json()
      setForm(parsed)
      setEditing('new')
      setShowImport(false)
      setImportUrl('')
      addToast(`Imported "${parsed.name}" — review and save!`, 'success')
    } catch (error) {
      addToast(error.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const addIngredient = () => {
    setForm(f => ({ ...f, ingredients: [...f.ingredients, { name: '', quantity: 1, unit: '', category: 'other' }] }))
  }
  const updateIngredient = (i, field, val) => {
    setForm(f => ({ ...f, ingredients: f.ingredients.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing) }))
  }
  const removeIngredient = (i) => {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }))
  }

  const filteredRecipes = useMemo(() => {
    let result = [...recipes]
    if (filters.search) {
      const s = filters.search.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(s) ||
        (r.description || '').toLowerCase().includes(s) ||
        r.tags?.some(t => t.toLowerCase().includes(s))
      )
    }
    return result
  }, [recipes, filters.search])

  const StarRating = ({ rating, onRate, interactive = false, size = 16 }) => {
    const [hover, setHover] = useState(0)
    return (
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <span key={star}
            onClick={() => interactive && onRate?.(star)}
            onMouseEnter={() => interactive && setHover(star)}
            onMouseLeave={() => interactive && setHover(0)}
            style={{ cursor: interactive ? 'pointer' : 'default', fontSize: size, 
              filter: (hover || rating) >= star ? 'none' : 'grayscale(1) opacity(0.3)',
              transition: 'all 0.15s ease', transform: hover === star ? 'scale(1.2)' : 'scale(1)' }}>⭐</span>
        ))}
      </div>
    )
  }

  // Recipe Detail View
  const RecipeDetailView = ({ recipe }) => {
    const [scaledServings, setScaledServings] = useState(recipe.servings || 4)
    const [scaledIngredients, setScaledIngredients] = useState(recipe.ingredients || [])
    const scaleFactor = scaledServings / (recipe.servings || 4)

    const scaleToServings = (newServings) => {
      if (newServings < 1) return
      setScaledServings(newServings)
      const factor = newServings / (recipe.servings || 4)
      setScaledIngredients((recipe.ingredients || []).map(ing => ({
        ...ing, quantity: Math.round(ing.quantity * factor * 100) / 100
      })))
    }

    const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)
    const hasNutrition = recipe.calories > 0 || recipe.protein > 0

    return (
      <div className="modal-overlay" onClick={() => setViewing(null)}>
        <div className="modal" style={{ width: isMobile ? '100%' : '700px', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {recipe.name}
              </h2>
              {recipe.description && (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {recipe.description}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => toggleFavorite(recipe.id)} className="btn btn-ghost btn-sm"
                style={{ color: recipe.is_favorite ? 'var(--color-danger)' : 'var(--text-muted)', fontSize: '1.25rem' }}>
                {recipe.is_favorite ? '❤️' : '🤍'}
              </button>
              <button onClick={() => setViewing(null)} className="btn btn-ghost btn-sm" style={{ fontSize: '1.25rem' }}>✕</button>
            </div>
          </div>

          {/* Meta chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {recipe.recipe_type && <span className="meta-chip">🍽️ {recipe.recipe_type}</span>}
            {recipe.cuisine_type && <span className="meta-chip">🌍 {recipe.cuisine_type}</span>}
            {recipe.difficulty && <span className="meta-chip" style={{ 
              color: recipe.difficulty === 'easy' ? 'var(--color-success)' : recipe.difficulty === 'hard' ? 'var(--color-danger)' : 'var(--color-accent)' 
            }}>📊 {recipe.difficulty}</span>}
            {totalTime > 0 && <span className="meta-chip">🕐 {totalTime}m</span>}
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="meta-chip" style={{ textDecoration: 'none', color: 'var(--color-info)' }}>
                🔗 Source
              </a>
            )}
          </div>

          {/* Rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <StarRating rating={recipe.rating || 0} interactive onRate={(r) => addRating(recipe.id, r)} size={20} />
            <span className="text-sm text-muted">
              {recipe.rating ? `${recipe.rating.toFixed(1)}` : 'No ratings'} 
              {recipe.rating_count > 0 && ` (${recipe.rating_count})`}
            </span>
          </div>

          {/* Nutritional Info */}
          {hasNutrition && (
            <div className="nutrition-bar" style={{ marginBottom: '1.25rem' }}>
              <div className="nutrition-item">
                <span className="nutrition-value" style={{ color: 'var(--color-danger)' }}>{Math.round(recipe.calories * scaleFactor)}</span>
                <span className="nutrition-label">Calories</span>
              </div>
              <div className="nutrition-item">
                <span className="nutrition-value" style={{ color: 'var(--color-info)' }}>{(recipe.protein * scaleFactor).toFixed(1)}g</span>
                <span className="nutrition-label">Protein</span>
              </div>
              <div className="nutrition-item">
                <span className="nutrition-value" style={{ color: 'var(--color-accent)' }}>{(recipe.carbs * scaleFactor).toFixed(1)}g</span>
                <span className="nutrition-label">Carbs</span>
              </div>
              <div className="nutrition-item">
                <span className="nutrition-value" style={{ color: 'var(--color-warning)' }}>{(recipe.fat * scaleFactor).toFixed(1)}g</span>
                <span className="nutrition-label">Fat</span>
              </div>
            </div>
          )}

          {/* Servings Scale Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <span className="text-sm font-medium text-secondary">Servings:</span>
            <div className="scale-control">
              <button className="scale-btn" onClick={() => scaleToServings(scaledServings - 1)}>−</button>
              <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: '1rem' }}>{scaledServings}</span>
              <button className="scale-btn" onClick={() => scaleToServings(scaledServings + 1)}>+</button>
            </div>
            {scaleFactor !== 1 && (
              <span className="text-xs text-muted">(×{scaleFactor.toFixed(2)} from original {recipe.servings})</span>
            )}
          </div>

          {/* Ingredients */}
          {scaledIngredients.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                📝 Ingredients ({scaledIngredients.length})
              </h3>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {scaledIngredients.map((ing, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)', fontSize: '0.9rem'
                  }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600, minWidth: 60 }}>
                      {ing.quantity > 0 ? ing.quantity : ''} {ing.unit}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{ing.name}</span>
                    {ing.category && ing.category !== 'other' && (
                      <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{ing.category}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          {recipe.instructions && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                👨‍🍳 Instructions
              </h3>
              <div style={{ 
                whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.7,
                color: 'var(--text-secondary)', padding: '1rem', background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)'
              }}>
                {recipe.instructions}
              </div>
            </div>
          )}

          {/* Tags */}
          {recipe.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {recipe.tags.map((tag, i) => (
                <span key={i} className="tag">{tag}</span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-primary)', paddingTop: '1rem' }}>
            <button onClick={() => { openEdit(recipe); setViewing(null) }} className="btn btn-secondary">✏️ Edit</button>
            <button onClick={() => { remove(recipe.id) }} className="btn btn-ghost text-danger">🗑️ Delete</button>
          </div>
        </div>
      </div>
    )
  }

  const RecipeCard = ({ recipe }) => (
    <div className="card recipe-card" style={{ position: 'relative', cursor: 'pointer' }}
      onClick={() => setViewing(recipe)}>
      {/* Image */}
      {recipe.image_url && (
        <div style={{ 
          width: '100%', height: 140, borderRadius: 'var(--radius-md)', overflow: 'hidden',
          marginBottom: '0.75rem', background: 'var(--bg-tertiary)'
        }}>
          <img src={recipe.image_url} alt={recipe.name} style={{
            width: '100%', height: '100%', objectFit: 'cover'
          }} onError={(e) => { e.target.style.display = 'none' }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {recipe.name}
          </h3>
          {recipe.description && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', 
              overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {recipe.description}
            </p>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggleFavorite(recipe.id) }}
          className="btn-ghost btn-sm"
          style={{ color: recipe.is_favorite ? 'var(--color-danger)' : 'var(--text-muted)', padding: '0.25rem' }}>
          {recipe.is_favorite ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
        {recipe.recipe_type && <span className="tag" style={{ fontSize: '0.65rem' }}>{recipe.recipe_type}</span>}
        {recipe.cuisine_type && <span className="tag" style={{ fontSize: '0.65rem' }}>{recipe.cuisine_type}</span>}
        {recipe.difficulty && (
          <span className="tag" style={{ fontSize: '0.65rem',
            color: recipe.difficulty === 'easy' ? 'var(--color-success)' : recipe.difficulty === 'hard' ? 'var(--color-danger)' : 'var(--color-accent)' }}>
            {recipe.difficulty}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <span>🕐 {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m</span>
          <span>🍽️ {recipe.servings}</span>
          {recipe.calories > 0 && <span>🔥 {recipe.calories}cal</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {recipe.rating > 0 && (
            <>
              <span style={{ color: 'var(--rating-star)' }}>⭐</span>
              <span>{recipe.rating.toFixed(1)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'mobile-stack' : ''}`} style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            👨‍🍳 Recipes
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} in your collection
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <button onClick={() => setShowImport(!showImport)} className="btn btn-secondary btn-sm">
            🔗 Import
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-secondary btn-sm">
            🔍 Filters
          </button>
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="btn btn-ghost btn-sm">
            {viewMode === 'grid' ? '📋' : '⊞'}
          </button>
          <button onClick={openNew} className="btn btn-primary">+ New Recipe</button>
        </div>
      </div>

      {/* Import from URL */}
      {showImport && (
        <div className="card import-url-section" style={{ marginBottom: '1.25rem', animation: 'slideUp 0.2s ease' }}>
          <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            🔗 Import Recipe from URL
          </h3>
          <p style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Paste a link from any recipe website. We'll extract the recipe details automatically.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importFromUrl()}
              placeholder="https://www.allrecipes.com/recipe/..."
              className="input"
              style={{ flex: 1 }}
              disabled={importing}
            />
            <button onClick={importFromUrl} disabled={importing || !importUrl.trim()} className="btn btn-primary">
              {importing ? (
                <><span className="loader" style={{ width: 16, height: 16 }}></span> Importing...</>
              ) : '🔍 Import'}
            </button>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr' }}>
          <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search recipes..." className="input" />
          <select value={filters.recipe_type} onChange={e => setFilters(f => ({ ...f, recipe_type: e.target.value }))} className="input select">
            <option value="">All Types</option>
            {RECIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))} className="input select">
            <option value="name">Sort: Name</option>
            <option value="created_at">Sort: Date</option>
            <option value="rating">Sort: Rating</option>
            <option value="prep_time">Sort: Prep Time</option>
          </select>
        </div>

        {showFilters && (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
            <select value={filters.cuisine} onChange={e => setFilters(f => ({ ...f, cuisine: e.target.value }))} className="input select">
              <option value="">All Cuisines</option>
              {CUISINES.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filters.difficulty} onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))} className="input select">
              <option value="">All Difficulties</option>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input type="number" placeholder="Max time (min)" value={filters.max_time}
              onChange={e => setFilters(f => ({ ...f, max_time: e.target.value }))} className="input" />
            <div className="flex items-center gap-sm">
              <input type="checkbox" id="favoritesOnly" checked={filters.favorites_only}
                onChange={e => setFilters(f => ({ ...f, favorites_only: e.target.checked }))}
                style={{ accentColor: 'var(--color-primary)' }} />
              <label htmlFor="favoritesOnly" className="text-sm">Favorites only</label>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="empty-state">
          <div className="loader" style={{ margin: '0 auto 1rem', width: 32, height: 32 }}></div>
          <p className="text-secondary">Loading recipes...</p>
        </div>
      )}

      {/* Recipe Grid */}
      {!loading && (
        <div style={{
          display: 'grid', gap: '1rem',
          gridTemplateColumns: viewMode === 'grid' && !isMobile ? 'repeat(auto-fill, minmax(300px, 1fr))' : '1fr'
        }}>
          {filteredRecipes.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} />)}
        </div>
      )}

      {!loading && filteredRecipes.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">👨‍🍳</div>
          <div className="empty-state-title">No recipes found</div>
          <div className="empty-state-text">
            {recipes.length === 0 ? 'Create your first recipe or import one from a URL!' : 'Try adjusting your search filters.'}
          </div>
          {recipes.length === 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button onClick={openNew} className="btn btn-primary">+ Create Recipe</button>
              <button onClick={() => setShowImport(true)} className="btn btn-secondary">🔗 Import from URL</button>
            </div>
          )}
        </div>
      )}

      {/* Recipe Detail View */}
      {viewing && <RecipeDetailView recipe={viewing} />}

      {/* Recipe Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ width: isMobile ? '100%' : '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {editing === 'new' ? '✨ New Recipe' : '✏️ Edit Recipe'}
            </h3>
            
            {form.source_url && (
              <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                <span className="text-muted">Imported from: </span>
                <a href={form.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-info)' }}>
                  {form.source_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                </a>
              </div>
            )}

            {/* Basic Info */}
            <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <label className="label">Recipe Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g., Spaghetti Carbonara" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input textarea" rows="2" placeholder="Brief description..." />
              </div>
            </div>

            {/* Details Grid */}
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
              <div><label className="label">Servings</label><input type="number" min="1" value={form.servings} onChange={e => setForm({ ...form, servings: parseInt(e.target.value) || 1 })} className="input" /></div>
              <div><label className="label">Prep (min)</label><input type="number" min="0" value={form.prep_time} onChange={e => setForm({ ...form, prep_time: parseInt(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Cook (min)</label><input type="number" min="0" value={form.cook_time} onChange={e => setForm({ ...form, cook_time: parseInt(e.target.value) || 0 })} className="input" /></div>
            </div>

            {/* Categories */}
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
              <div><label className="label">Type</label>
                <select value={form.recipe_type} onChange={e => setForm({ ...form, recipe_type: e.target.value })} className="input select">
                  {RECIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><label className="label">Cuisine</label>
                <select value={form.cuisine_type} onChange={e => setForm({ ...form, cuisine_type: e.target.value })} className="input select">
                  <option value="">—</option>
                  {CUISINES.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label className="label">Difficulty</label>
                <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })} className="input select">
                  {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select></div>
            </div>

            {/* Nutrition */}
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.25rem' }}>
              <div><label className="label">Calories</label><input type="number" min="0" value={form.calories} onChange={e => setForm({ ...form, calories: parseInt(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Protein (g)</label><input type="number" min="0" step="0.1" value={form.protein} onChange={e => setForm({ ...form, protein: parseFloat(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Carbs (g)</label><input type="number" min="0" step="0.1" value={form.carbs} onChange={e => setForm({ ...form, carbs: parseFloat(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Fat (g)</label><input type="number" min="0" step="0.1" value={form.fat} onChange={e => setForm({ ...form, fat: parseFloat(e.target.value) || 0 })} className="input" /></div>
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="label">Tags</label>
              <input value={(form.tags || []).join(', ')} onChange={e => setForm({ ...form, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                className="input" placeholder="e.g., vegetarian, quick, comfort-food" />
            </div>

            {/* Instructions */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="label">Instructions</label>
              <textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })}
                className="input textarea" rows="5" placeholder="Step-by-step instructions..." />
            </div>

            {/* Ingredients */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <label className="label" style={{ margin: 0 }}>Ingredients</label>
                <button onClick={addIngredient} className="btn btn-secondary btn-sm">+ Add</button>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {form.ingredients?.map((ing, i) => (
                  <div key={i} style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: isMobile ? '2fr 1fr auto' : '2fr 1fr 1fr 1fr auto', marginBottom: '0.5rem' }}>
                    <input placeholder="Name" value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)} className="input" />
                    <input placeholder="Qty" type="number" step="0.1" min="0" value={ing.quantity} onChange={e => updateIngredient(i, 'quantity', parseFloat(e.target.value) || 0)} className="input" />
                    {!isMobile && <input placeholder="Unit" value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} className="input" />}
                    {!isMobile && (
                      <select value={ing.category} onChange={e => updateIngredient(i, 'category', e.target.value)} className="input select">
                        {AISLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <button onClick={() => removeIngredient(i)} className="btn btn-ghost btn-sm text-danger" style={{ padding: '0.25rem' }}>×</button>
                  </div>
                ))}
                {(!form.ingredients || form.ingredients.length === 0) && (
                  <div className="text-center text-muted" style={{ padding: '1.5rem' }}>
                    No ingredients yet. <button onClick={addIngredient} className="btn btn-secondary btn-sm" style={{ marginLeft: '0.5rem' }}>Add First</button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-primary)', paddingTop: '1rem' }}>
              <button onClick={() => setEditing(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={save} disabled={!form.name || loading} className="btn btn-primary">
                {loading ? 'Saving...' : '💾 Save Recipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
