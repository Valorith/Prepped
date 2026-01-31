import React, { useState, useEffect, useMemo, useCallback } from 'react'

const RECIPE_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'appetizer']
const CUISINES = ['', 'american', 'italian', 'mexican', 'asian', 'indian', 'mediterranean', 'french', 'chinese', 'thai', 'japanese', 'korean', 'greek', 'spanish', 'other']
const DIFFICULTIES = ['easy', 'medium', 'hard']
const AISLE_CATEGORIES = ['produce', 'meat', 'dairy', 'pantry', 'grains', 'condiments', 'spices', 'frozen', 'other']

export default function RecipeManager({ addToast, isMobile }) {
  // My Recipes state
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [myRecipesSearch, setMyRecipesSearch] = useState('')
  const [viewMode, setViewMode] = useState(isMobile ? 'list' : 'grid')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    search: '', category: '', cuisine: '', difficulty: '',
    max_time: '', min_rating: '', favorites_only: false,
    recipe_type: '', sort: 'name', order: 'asc'
  })

  // Discovery state
  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverResults, setDiscoverResults] = useState([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [areas, setAreas] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedArea, setSelectedArea] = useState(null)
  const [detailRecipe, setDetailRecipe] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [importingId, setImportingId] = useState(null)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [featuredRecipes, setFeaturedRecipes] = useState([])
  const [featuredLoading, setFeaturedLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('discover') // 'discover' | 'myrecipes'

  function emptyForm() {
    return { 
      name: '', description: '', servings: 4, prep_time: 0, cook_time: 0, 
      instructions: '', tags: [], ingredients: [], calories: 0, protein: 0, 
      carbs: 0, fat: 0, difficulty: 'medium', cuisine_type: '', recipe_type: 'dinner',
      source_url: '', image_url: ''
    }
  }

  // Load my recipes
  useEffect(() => { loadRecipes() }, [filters])

  // Load categories, areas, and featured on mount
  useEffect(() => {
    fetch('/api/discover/categories').then(r => r.json()).then(setCategories).catch(() => {})
    fetch('/api/discover/areas').then(r => r.json()).then(setAreas).catch(() => {})
    loadFeatured()
  }, [])

  const loadFeatured = async () => {
    setFeaturedLoading(true)
    try {
      // Load 3 random recipes for the featured section
      const results = await Promise.all([
        fetch('/api/discover/random').then(r => r.json()),
        fetch('/api/discover/random').then(r => r.json()),
        fetch('/api/discover/random').then(r => r.json()),
      ])
      setFeaturedRecipes(results.map(r => r[0]).filter(Boolean))
    } catch {} 
    finally { setFeaturedLoading(false) }
  }

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
    } catch { addToast('Failed to load recipes', 'error') }
    finally { setLoading(false) }
  }

  // Discovery functions
  const searchDiscover = useCallback(async () => {
    if (!discoverQuery.trim()) return
    setDiscoverLoading(true)
    setSelectedCategory(null)
    setSelectedArea(null)
    try {
      const res = await fetch(`/api/discover/search?q=${encodeURIComponent(discoverQuery)}`)
      const data = await res.json()
      setDiscoverResults(data)
      if (!data.length) addToast('No recipes found', 'info')
    } catch { addToast('Search failed', 'error') }
    finally { setDiscoverLoading(false) }
  }, [discoverQuery])

  const filterByCategory = async (cat) => {
    setSelectedCategory(cat)
    setSelectedArea(null)
    setDiscoverLoading(true)
    try {
      const res = await fetch(`/api/discover/filter/category/${encodeURIComponent(cat)}`)
      setDiscoverResults(await res.json())
    } catch { addToast('Failed to load category', 'error') }
    finally { setDiscoverLoading(false) }
  }

  const filterByArea = async (area) => {
    setSelectedArea(area)
    setSelectedCategory(null)
    setDiscoverLoading(true)
    try {
      const res = await fetch(`/api/discover/filter/area/${encodeURIComponent(area)}`)
      setDiscoverResults(await res.json())
    } catch { addToast('Failed to load cuisine', 'error') }
    finally { setDiscoverLoading(false) }
  }

  const lookupDetail = async (mealdbId) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/discover/lookup/${mealdbId}`)
      setDetailRecipe(await res.json())
    } catch { addToast('Failed to load recipe details', 'error') }
    finally { setDetailLoading(false) }
  }

  const getRandom = async () => {
    setDiscoverLoading(true)
    try {
      const res = await fetch('/api/discover/random')
      const data = await res.json()
      if (data.length) setDetailRecipe(data[0])
    } catch { addToast('Failed to get random recipe', 'error') }
    finally { setDiscoverLoading(false) }
  }

  const importRecipe = async (recipe) => {
    setImportingId(recipe.mealdb_id || 'url')
    try {
      const payload = { ...recipe }
      delete payload.mealdb_id
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save')
      const saved = await res.json()
      addToast(`"${saved.name}" saved to My Recipes!`, 'success')
      setRecipes(prev => [...prev, { ...saved, tags: typeof saved.tags === 'string' ? JSON.parse(saved.tags || '[]') : saved.tags || [], ingredients: saved.ingredients || [] }])
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
      addToast(`Parsed "${parsed.name}" — review and save!`, 'success')
    } catch (e) {
      addToast(e.message, 'error')
    } finally { setImporting(false) }
  }

  // My Recipes CRUD
  const openNew = () => { setForm(emptyForm()); setEditing('new'); setActiveSection('myrecipes') }
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
    } finally { setLoading(false) }
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

  // ========== SUB-COMPONENTS ==========

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

  // Discover thumbnail card
  const DiscoverThumbCard = ({ item }) => (
    <div className="card" style={{ cursor: 'pointer', padding: '0.75rem', transition: 'all 0.15s' }}
      onClick={() => lookupDetail(item.mealdb_id)}>
      {item.image_url && (
        <div style={{ width: '100%', height: 120, borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '0.5rem', background: 'var(--bg-tertiary)' }}>
          <img src={item.image_url} alt={item.name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
    </div>
  )

  // Discover full result card (from search)
  const DiscoverResultCard = ({ recipe }) => (
    <div className="card" style={{ cursor: 'pointer', padding: '0.75rem', transition: 'all 0.15s' }}
      onClick={() => setDetailRecipe(recipe)}>
      {recipe.image_url && (
        <div style={{ width: '100%', height: 130, borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '0.5rem', background: 'var(--bg-tertiary)' }}>
          <img src={recipe.image_url} alt={recipe.name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{recipe.name}</div>
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

  // Featured recipe card (larger, with image)
  const FeaturedCard = ({ recipe }) => (
    <div className="card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden', transition: 'all 0.15s' }}
      onClick={() => setDetailRecipe(recipe)}>
      {recipe.image_url && (
        <div style={{ width: '100%', height: 160, background: 'var(--bg-tertiary)' }}>
          <img src={recipe.image_url} alt={recipe.name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div style={{ padding: '0.75rem' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{recipe.name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {recipe.cuisine_type && <span>🌍 {recipe.cuisine_type}</span>}
          {recipe.tags?.length > 0 && <span> • {recipe.tags.slice(0, 2).join(', ')}</span>}
        </div>
      </div>
    </div>
  )

  // My Recipe card
  const MyRecipeCard = ({ recipe }) => (
    <div className="card recipe-card" style={{ position: 'relative', cursor: 'pointer' }}
      onClick={() => setViewing(recipe)}>
      {recipe.image_url && (
        <div style={{ width: '100%', height: 140, borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '0.75rem', background: 'var(--bg-tertiary)' }}>
          <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{recipe.name}</h3>
          {recipe.description && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {recipe.description}
            </p>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggleFavorite(recipe.id) }} className="btn-ghost btn-sm"
          style={{ color: recipe.is_favorite ? 'var(--color-danger)' : 'var(--text-muted)', padding: '0.25rem' }}>
          {recipe.is_favorite ? '❤️' : '🤍'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
        {recipe.import_source === 'themealdb' && (
          <span className="tag" style={{ fontSize: '0.6rem', background: 'var(--color-primary)', color: '#fff', fontWeight: 600 }}>🍽️ MealDB</span>
        )}
        {recipe.import_source === 'url' && (
          <span className="tag" style={{ fontSize: '0.6rem', background: 'var(--color-info)', color: '#fff', fontWeight: 600 }}>🔗 Imported</span>
        )}
        {recipe.recipe_type && <span className="tag" style={{ fontSize: '0.65rem' }}>{recipe.recipe_type}</span>}
        {recipe.cuisine_type && <span className="tag" style={{ fontSize: '0.65rem' }}>{recipe.cuisine_type}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <span>🕐 {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m</span>
          <span>🍽️ {recipe.servings}</span>
        </div>
        {recipe.rating > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: 'var(--rating-star)' }}>⭐</span>
            <span>{recipe.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  )

  // Recipe Detail Modal (for both discover preview and my recipe view)
  const DetailModal = () => {
    if (!detailRecipe) return null
    const r = detailRecipe
    const isFromMyRecipes = r.id && recipes.some(mr => mr.id === r.id)
    
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {r.mealdb_id && <span className="meta-chip" style={{ background: 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>🍽️ TheMealDB</span>}
            {r.import_source === 'url' && <span className="meta-chip" style={{ background: 'var(--color-info)', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>🔗 URL Import</span>}
            {r.cuisine_type && <span className="meta-chip">🌍 {r.cuisine_type}</span>}
            {r.tags?.slice(0, 4).map((t, i) => <span key={i} className="tag">{t}</span>)}
          </div>

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

          {r.instructions && (
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>👨‍🍳 Instructions</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary)', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', maxHeight: 250, overflowY: 'auto' }}>
                {r.instructions}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-primary)', paddingTop: '1rem' }}>
            <button onClick={() => setDetailRecipe(null)} className="btn btn-secondary">Cancel</button>
            {!isFromMyRecipes && (
              <button onClick={() => importRecipe(r)} disabled={importingId} className="btn btn-primary">
                {importingId ? '⏳ Saving...' : '📥 Save to My Recipes'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // My Recipe Detail View (with rating, scaling, edit, delete)
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{recipe.name}</h2>
              {recipe.description && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>{recipe.description}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => toggleFavorite(recipe.id)} className="btn btn-ghost btn-sm"
                style={{ color: recipe.is_favorite ? 'var(--color-danger)' : 'var(--text-muted)', fontSize: '1.25rem' }}>
                {recipe.is_favorite ? '❤️' : '🤍'}
              </button>
              <button onClick={() => setViewing(null)} className="btn btn-ghost btn-sm" style={{ fontSize: '1.25rem' }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {recipe.recipe_type && <span className="meta-chip">🍽️ {recipe.recipe_type}</span>}
            {recipe.cuisine_type && <span className="meta-chip">🌍 {recipe.cuisine_type}</span>}
            {recipe.difficulty && <span className="meta-chip" style={{ color: recipe.difficulty === 'easy' ? 'var(--color-success)' : recipe.difficulty === 'hard' ? 'var(--color-danger)' : 'var(--color-accent)' }}>📊 {recipe.difficulty}</span>}
            {totalTime > 0 && <span className="meta-chip">🕐 {totalTime}m</span>}
            {recipe.import_source === 'themealdb' && <span className="meta-chip" style={{ background: 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>🍽️ TheMealDB</span>}
            {recipe.import_source === 'url' && <span className="meta-chip" style={{ background: 'var(--color-info)', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>🔗 URL Import</span>}
            {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="meta-chip" style={{ textDecoration: 'none', color: 'var(--color-info)' }}>🔗 Source</a>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <StarRating rating={recipe.rating || 0} interactive onRate={(r) => addRating(recipe.id, r)} size={20} />
            <span className="text-sm text-muted">
              {recipe.rating ? `${recipe.rating.toFixed(1)}` : 'No ratings'} 
              {recipe.rating_count > 0 && ` (${recipe.rating_count})`}
            </span>
          </div>

          {hasNutrition && (
            <div className="nutrition-bar" style={{ marginBottom: '1.25rem' }}>
              <div className="nutrition-item"><span className="nutrition-value" style={{ color: 'var(--color-danger)' }}>{Math.round(recipe.calories * scaleFactor)}</span><span className="nutrition-label">Calories</span></div>
              <div className="nutrition-item"><span className="nutrition-value" style={{ color: 'var(--color-info)' }}>{(recipe.protein * scaleFactor).toFixed(1)}g</span><span className="nutrition-label">Protein</span></div>
              <div className="nutrition-item"><span className="nutrition-value" style={{ color: 'var(--color-accent)' }}>{(recipe.carbs * scaleFactor).toFixed(1)}g</span><span className="nutrition-label">Carbs</span></div>
              <div className="nutrition-item"><span className="nutrition-value" style={{ color: 'var(--color-warning)' }}>{(recipe.fat * scaleFactor).toFixed(1)}g</span><span className="nutrition-label">Fat</span></div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <span className="text-sm font-medium text-secondary">Servings:</span>
            <div className="scale-control">
              <button className="scale-btn" onClick={() => scaleToServings(scaledServings - 1)}>−</button>
              <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: '1rem' }}>{scaledServings}</span>
              <button className="scale-btn" onClick={() => scaleToServings(scaledServings + 1)}>+</button>
            </div>
            {scaleFactor !== 1 && <span className="text-xs text-muted">(×{scaleFactor.toFixed(2)} from original {recipe.servings})</span>}
          </div>

          {scaledIngredients.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>📝 Ingredients ({scaledIngredients.length})</h3>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {scaledIngredients.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600, minWidth: 60 }}>{ing.quantity > 0 ? ing.quantity : ''} {ing.unit}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{ing.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recipe.instructions && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>👨‍🍳 Instructions</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-secondary)', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}>
                {recipe.instructions}
              </div>
            </div>
          )}

          {recipe.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {recipe.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-primary)', paddingTop: '1rem' }}>
            <button onClick={() => { openEdit(recipe); setViewing(null) }} className="btn btn-secondary">✏️ Edit</button>
            <button onClick={() => { remove(recipe.id) }} className="btn btn-ghost text-danger">🗑️ Delete</button>
          </div>
        </div>
      </div>
    )
  }

  // ========== MAIN RENDER ==========

  return (
    <div>
      {/* Page Header with Tab Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            👨‍🍳 Recipes
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Discover, import, and manage your recipes
          </p>
        </div>
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--border-primary)', paddingBottom: 0 }}>
        <button
          onClick={() => setActiveSection('discover')}
          style={{
            padding: '0.65rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: activeSection === 'discover' ? 700 : 400,
            color: activeSection === 'discover' ? 'var(--color-primary)' : 'var(--text-muted)',
            borderBottom: activeSection === 'discover' ? '3px solid var(--color-primary)' : '3px solid transparent',
            marginBottom: '-2px', transition: 'all 0.15s', borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
          }}>
          🌐 Discover & Import
        </button>
        <button
          onClick={() => setActiveSection('myrecipes')}
          style={{
            padding: '0.65rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: activeSection === 'myrecipes' ? 700 : 400,
            color: activeSection === 'myrecipes' ? 'var(--color-primary)' : 'var(--text-muted)',
            borderBottom: activeSection === 'myrecipes' ? '3px solid var(--color-primary)' : '3px solid transparent',
            marginBottom: '-2px', transition: 'all 0.15s', borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
          }}>
          📚 My Recipes {recipes.length > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({recipes.length})</span>}
        </button>
      </div>

      {/* ====== DISCOVER & IMPORT SECTION ====== */}
      {activeSection === 'discover' && (
        <div>
          {/* URL Import Bar — always visible */}
          <div className="card" style={{ marginBottom: '1.25rem', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '1.1rem' }}>🔗</span>
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && importFromUrl()}
                placeholder="Paste a recipe URL to import..."
                className="input"
                style={{ flex: 1 }}
                disabled={importing}
              />
              <button onClick={importFromUrl} disabled={importing || !importUrl.trim()} className="btn btn-primary">
                {importing ? '⏳' : '📥'} Import
              </button>
            </div>
          </div>

          {/* Search TheMealDB */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                value={discoverQuery}
                onChange={e => setDiscoverQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchDiscover()}
                placeholder="Search thousands of recipes (e.g., chicken, pasta, salad)..."
                className="input"
                style={{ flex: 1 }}
              />
              <button onClick={searchDiscover} disabled={discoverLoading || !discoverQuery.trim()} className="btn btn-primary">
                {discoverLoading ? '⏳' : '🔍'} Search
              </button>
              <button onClick={getRandom} disabled={discoverLoading} className="btn btn-secondary" title="Get a random recipe">
                🎲
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Browse free recipes from TheMealDB — search, pick a category, or try your luck with random!
            </p>
          </div>

          {/* Category Tiles */}
          {!selectedCategory && !selectedArea && discoverResults.length === 0 && (
            <>
              {/* Featured / Random Recipes */}
              {featuredRecipes.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>🎲 Try Something New</h3>
                    <button onClick={loadFeatured} disabled={featuredLoading} className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }}>
                      {featuredLoading ? '⏳' : '🔄'} Refresh
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}>
                    {featuredRecipes.map((r, i) => <FeaturedCard key={i} recipe={r} />)}
                  </div>
                </div>
              )}

              {/* Category Tiles */}
              {categories.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>📂 Browse by Category</h3>
                  <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(7, 1fr)' }}>
                    {categories.map(cat => (
                      <div key={cat.idCategory} className="card" 
                        style={{ cursor: 'pointer', padding: '0.5rem', textAlign: 'center', transition: 'all 0.15s' }}
                        onClick={() => filterByCategory(cat.strCategory)}>
                        <img src={cat.strCategoryThumb} alt={cat.strCategory} 
                          style={{ width: 40, height: 40, objectFit: 'contain', margin: '0 auto 0.35rem', display: 'block' }} />
                        <div style={{ fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-primary)' }}>{cat.strCategory}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cuisine Tags */}
              {areas.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>🌍 Browse by Cuisine</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {areas.map(area => (
                      <button key={area} onClick={() => filterByArea(area)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.8rem' }}>
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Back buttons for filtered views */}
          {(selectedCategory || selectedArea) && (
            <div style={{ marginBottom: '1rem' }}>
              <button onClick={() => { setSelectedCategory(null); setSelectedArea(null); setDiscoverResults([]) }} className="btn btn-secondary btn-sm">
                ← Back to Browse
              </button>
              <h3 style={{ margin: '0.75rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {selectedCategory ? `📂 ${selectedCategory}` : `🌍 ${selectedArea} Cuisine`}
              </h3>
            </div>
          )}

          {/* Discover Results Grid */}
          {discoverLoading && (
            <div className="empty-state">
              <div className="loader" style={{ margin: '0 auto 1rem', width: 32, height: 32 }}></div>
              <p className="text-secondary">Searching recipes...</p>
            </div>
          )}

          {!discoverLoading && discoverResults.length > 0 && (
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)' }}>
              {discoverResults.map((r, i) => 
                r.ingredients ? <DiscoverResultCard key={i} recipe={r} /> : <DiscoverThumbCard key={i} item={r} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ====== MY RECIPES SECTION ====== */}
      {activeSection === 'myrecipes' && (
        <div>
          {/* My Recipes Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div className="flex items-center gap-sm">
              <button onClick={() => setShowFilters(!showFilters)} className="btn btn-secondary btn-sm">🔍 Filters</button>
              <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="btn btn-ghost btn-sm">
                {viewMode === 'grid' ? '📋' : '⊞'}
              </button>
            </div>
            <button onClick={openNew} className="btn btn-ghost btn-sm" style={{ fontSize: '0.85rem' }}>
              ✏️ Create Custom Recipe
            </button>
          </div>

          {/* Search and Filters */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr' }}>
              <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Search your recipes..." className="input" />
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
              {filteredRecipes.map(recipe => <MyRecipeCard key={recipe.id} recipe={recipe} />)}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredRecipes.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <div className="empty-state-title">
                {recipes.length === 0 ? 'No recipes yet' : 'No matching recipes'}
              </div>
              <div className="empty-state-text">
                {recipes.length === 0 
                  ? 'Start by discovering and importing recipes from the Discover tab!'
                  : 'Try adjusting your search filters.'}
              </div>
              {recipes.length === 0 && (
                <button onClick={() => setActiveSection('discover')} className="btn btn-primary">
                  🌐 Go to Discover
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====== MODALS ====== */}

      {/* Discover Detail / Import Preview */}
      {detailLoading && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="loader" style={{ width: 40, height: 40 }}></div>
          </div>
        </div>
      )}
      <DetailModal />

      {/* My Recipe Detail View */}
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

            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
              <div><label className="label">Servings</label><input type="number" min="1" value={form.servings} onChange={e => setForm({ ...form, servings: parseInt(e.target.value) || 1 })} className="input" /></div>
              <div><label className="label">Prep (min)</label><input type="number" min="0" value={form.prep_time} onChange={e => setForm({ ...form, prep_time: parseInt(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Cook (min)</label><input type="number" min="0" value={form.cook_time} onChange={e => setForm({ ...form, cook_time: parseInt(e.target.value) || 0 })} className="input" /></div>
            </div>

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

            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.25rem' }}>
              <div><label className="label">Calories</label><input type="number" min="0" value={form.calories} onChange={e => setForm({ ...form, calories: parseInt(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Protein (g)</label><input type="number" min="0" step="0.1" value={form.protein} onChange={e => setForm({ ...form, protein: parseFloat(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Carbs (g)</label><input type="number" min="0" step="0.1" value={form.carbs} onChange={e => setForm({ ...form, carbs: parseFloat(e.target.value) || 0 })} className="input" /></div>
              <div><label className="label">Fat (g)</label><input type="number" min="0" step="0.1" value={form.fat} onChange={e => setForm({ ...form, fat: parseFloat(e.target.value) || 0 })} className="input" /></div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="label">Tags</label>
              <input value={(form.tags || []).join(', ')} onChange={e => setForm({ ...form, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                className="input" placeholder="e.g., vegetarian, quick, comfort-food" />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="label">Instructions</label>
              <textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })}
                className="input textarea" rows="5" placeholder="Step-by-step instructions..." />
            </div>

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
