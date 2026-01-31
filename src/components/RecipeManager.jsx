import React, { useState, useEffect, useMemo } from 'react'

const RECIPE_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'appetizer']
const CUISINES = ['', 'american', 'italian', 'mexican', 'asian', 'indian', 'mediterranean', 'french', 'chinese', 'thai', 'japanese', 'korean', 'greek', 'spanish', 'other']
const DIFFICULTIES = ['easy', 'medium', 'hard']
const AISLE_CATEGORIES = ['produce', 'meat', 'dairy', 'pantry', 'grains', 'condiments', 'spices', 'frozen', 'other']

export default function RecipeManager({ addToast, isMobile }) {
  const [recipes, setRecipes] = useState([])
  const [editing, setEditing] = useState(null) // null or recipe object
  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    cuisine: '',
    difficulty: '',
    max_time: '',
    min_rating: '',
    favorites_only: false,
    recipe_type: '',
    sort: 'name',
    order: 'asc'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState(isMobile ? 'list' : 'grid') // 'grid' or 'list'

  function emptyForm() {
    return { 
      name: '', description: '', servings: 4, prep_time: 0, cook_time: 0, 
      instructions: '', tags: [], ingredients: [], calories: 0, protein: 0, 
      carbs: 0, fat: 0, difficulty: 'medium', cuisine_type: '', recipe_type: 'dinner',
      source_url: '', image_url: ''
    }
  }

  useEffect(() => {
    loadRecipes()
  }, [filters])

  const loadRecipes = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== false) {
          params.append(key, value)
        }
      })
      
      const response = await fetch(`/api/recipes?${params}`)
      if (!response.ok) throw new Error('Failed to load recipes')
      const data = await response.json()
      setRecipes(data)
    } catch (error) {
      console.error('Error loading recipes:', error)
      addToast('Failed to load recipes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => { 
    setForm(emptyForm()) 
    setEditing('new') 
  }
  
  const openEdit = (r) => { 
    setForm({ ...r, tags: r.tags || [] }) 
    setEditing(r.id) 
  }

  const save = async () => {
    try {
      if (!form.name.trim()) {
        addToast('Recipe name is required', 'error')
        return
      }

      setLoading(true)
      const method = editing === 'new' ? 'POST' : 'PUT'
      const url = editing === 'new' ? '/api/recipes' : `/api/recipes/${editing}`
      
      const payload = {
        ...form,
        name: form.name.trim(),
        tags: Array.isArray(form.tags) ? form.tags : [],
        ingredients: form.ingredients.filter(ing => ing.name && ing.name.trim())
      }

      const res = await fetch(url, { 
        method, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to save recipe')
      }
      
      const saved = await res.json()
      
      if (editing === 'new') {
        setRecipes(prev => [...prev, saved])
        addToast('Recipe created successfully!', 'success')
      } else {
        setRecipes(prev => prev.map(r => r.id === saved.id ? saved : r))
        addToast('Recipe updated successfully!', 'success')
      }
      
      setEditing(null)
    } catch (error) {
      console.error('Error saving recipe:', error)
      addToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Are you sure you want to delete this recipe?')) return
    
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete recipe')
      
      setRecipes(prev => prev.filter(r => r.id !== id))
      addToast('Recipe deleted', 'success')
    } catch (error) {
      console.error('Error deleting recipe:', error)
      addToast('Failed to delete recipe', 'error')
    }
  }

  const toggleFavorite = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}/favorite`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to update favorite')
      
      const { is_favorite } = await res.json()
      setRecipes(prev => prev.map(r => 
        r.id === id ? { ...r, is_favorite: is_favorite ? 1 : 0 } : r
      ))
      
      addToast(is_favorite ? 'Added to favorites' : 'Removed from favorites', 'success')
    } catch (error) {
      console.error('Error updating favorite:', error)
      addToast('Failed to update favorite', 'error')
    }
  }

  const addRating = async (id, rating, comment = '') => {
    try {
      const res = await fetch(`/api/recipes/${id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment })
      })
      
      if (!res.ok) throw new Error('Failed to add rating')
      
      const { rating: newRating, rating_count } = await res.json()
      setRecipes(prev => prev.map(r => 
        r.id === id ? { ...r, rating: newRating, rating_count } : r
      ))
      
      addToast('Rating added!', 'success')
    } catch (error) {
      console.error('Error adding rating:', error)
      addToast('Failed to add rating', 'error')
    }
  }

  const scaleRecipe = async (id, servings) => {
    try {
      const res = await fetch(`/api/recipes/${id}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servings })
      })
      
      if (!res.ok) throw new Error('Failed to scale recipe')
      
      const scaled = await res.json()
      setForm(scaled)
      addToast(`Recipe scaled to ${servings} servings`, 'success')
    } catch (error) {
      console.error('Error scaling recipe:', error)
      addToast('Failed to scale recipe', 'error')
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

  const StarRating = ({ rating, onRate, interactive = false }) => {
    const [hover, setHover] = useState(0)
    
    return (
      <div className="stars">
        {[1, 2, 3, 4, 5].map(star => (
          <span
            key={star}
            className={`star ${(hover || rating) >= star ? 'filled' : ''}`}
            onClick={() => interactive && onRate && onRate(star)}
            onMouseEnter={() => interactive && setHover(star)}
            onMouseLeave={() => interactive && setHover(0)}
            style={{ 
              cursor: interactive ? 'pointer' : 'default',
              fontSize: '16px'
            }}
          >
            ⭐
          </span>
        ))}
      </div>
    )
  }

  const RecipeCard = ({ recipe }) => (
    <div className="card card-compact" style={{ position: 'relative' }}>
      <div className="flex items-start justify-between" style={{ marginBottom: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <h3 className="text-base font-semibold text-primary" style={{ marginBottom: '0.25rem' }}>
            {recipe.name}
          </h3>
          <p className="text-sm text-muted" style={{ marginBottom: '0.5rem' }}>
            {recipe.description || 'No description'}
          </p>
        </div>
        <button
          onClick={() => toggleFavorite(recipe.id)}
          className="btn-ghost btn-sm"
          style={{ 
            color: recipe.is_favorite ? 'var(--color-danger)' : 'var(--text-muted)',
            padding: '0.25rem'
          }}
        >
          {recipe.is_favorite ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-xs" style={{ marginBottom: '0.75rem' }}>
        {recipe.recipe_type && (
          <span className={`tag meal-${recipe.recipe_type}`}>
            {recipe.recipe_type}
          </span>
        )}
        {recipe.cuisine_type && (
          <span className="tag">{recipe.cuisine_type}</span>
        )}
        {recipe.difficulty && (
          <span className={`tag difficulty-${recipe.difficulty}`}>
            {recipe.difficulty}
          </span>
        )}
        {recipe.tags?.slice(0, 2).map((tag, i) => (
          <span key={i} className="tag">{tag}</span>
        ))}
        {recipe.tags?.length > 2 && (
          <span className="tag">+{recipe.tags.length - 2}</span>
        )}
      </div>

      {/* Stats */}
      <div className="text-xs text-muted" style={{ marginBottom: '0.75rem' }}>
        <div>🕐 {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m • 🍽️ {recipe.servings} servings</div>
        <div>📋 {recipe.ingredients?.length || 0} ingredients</div>
        {recipe.calories > 0 && <div>🔥 {recipe.calories} cal</div>}
      </div>

      {/* Rating */}
      <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
        <StarRating rating={recipe.rating || 0} />
        {recipe.rating_count > 0 && (
          <span className="text-xs text-muted">({recipe.rating_count})</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-sm">
        <button onClick={() => openEdit(recipe)} className="btn btn-secondary btn-sm">
          ✏️ Edit
        </button>
        <button 
          onClick={() => remove(recipe.id)} 
          className="btn btn-ghost btn-sm text-danger"
        >
          🗑️ Delete
        </button>
      </div>
    </div>
  )

  const filteredRecipes = useMemo(() => {
    let result = [...recipes]
    
    if (filters.search) {
      const search = filters.search.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search) ||
        r.tags?.some(t => t.toLowerCase().includes(search))
      )
    }
    
    return result
  }, [recipes, filters.search])

  return (
    <div>
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'mobile-stack' : ''}`} 
           style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <h2 className="text-2xl font-bold text-primary" style={{ margin: 0 }}>
          👨‍🍳 Recipe Manager
        </h2>
        <div className="flex items-center gap-sm">
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-secondary btn-sm">
            🔍 Filters
          </button>
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="btn btn-ghost btn-sm">
            {viewMode === 'grid' ? '📋' : '⊞'}
          </button>
          <button onClick={openNew} className="btn btn-primary">
            + New Recipe
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className={`grid gap-md ${isMobile ? '' : 'grid-cols-3'}`} style={{
          gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr'
        }}>
          <input 
            value={filters.search} 
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search recipes..." 
            className="input" 
          />
          <select 
            value={filters.recipe_type}
            onChange={e => setFilters(f => ({ ...f, recipe_type: e.target.value }))}
            className="input select"
          >
            <option value="">All Types</option>
            {RECIPE_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select 
            value={filters.sort}
            onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}
            className="input select"
          >
            <option value="name">Name</option>
            <option value="created_at">Date Created</option>
            <option value="rating">Rating</option>
            <option value="prep_time">Prep Time</option>
          </select>
        </div>

        {showFilters && (
          <div className={`grid gap-md ${isMobile ? '' : 'grid-cols-4'}`} 
               style={{ marginTop: '1rem', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
            <select 
              value={filters.cuisine}
              onChange={e => setFilters(f => ({ ...f, cuisine: e.target.value }))}
              className="input select"
            >
              <option value="">All Cuisines</option>
              {CUISINES.filter(c => c).map(cuisine => (
                <option key={cuisine} value={cuisine}>{cuisine}</option>
              ))}
            </select>
            <select 
              value={filters.difficulty}
              onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}
              className="input select"
            >
              <option value="">All Difficulties</option>
              {DIFFICULTIES.map(diff => (
                <option key={diff} value={diff}>{diff}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Max time (min)"
              value={filters.max_time}
              onChange={e => setFilters(f => ({ ...f, max_time: e.target.value }))}
              className="input"
            />
            <div className="flex items-center gap-sm">
              <input
                type="checkbox"
                id="favoritesOnly"
                checked={filters.favorites_only}
                onChange={e => setFilters(f => ({ ...f, favorites_only: e.target.checked }))}
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <label htmlFor="favoritesOnly" className="text-sm">Favorites only</label>
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center" style={{ padding: '2rem' }}>
          <div className="loader" style={{ margin: '0 auto 1rem' }}></div>
          <p className="text-secondary">Loading recipes...</p>
        </div>
      )}

      {/* Recipe Grid */}
      {!loading && (
        <div className={`grid gap-lg ${viewMode === 'grid' && !isMobile ? 'grid-cols-auto-fill' : ''}`} 
             style={{ 
               gridTemplateColumns: viewMode === 'grid' && !isMobile 
                 ? 'repeat(auto-fill, minmax(320px, 1fr))' 
                 : '1fr' 
             }}>
          {filteredRecipes.map(recipe => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {!loading && filteredRecipes.length === 0 && (
        <div className="text-center text-muted" style={{ padding: '3rem' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>👨‍🍳</p>
          <p>No recipes found</p>
          <p className="text-sm">Try adjusting your filters or create your first recipe!</p>
        </div>
      )}

      {/* Recipe Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ width: isMobile ? '100%' : '600px' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-primary" style={{ marginBottom: '1.5rem' }}>
              {editing === 'new' ? 'New Recipe' : 'Edit Recipe'}
            </h3>
            
            {/* Basic Info */}
            <div className="grid gap-md" style={{ marginBottom: '1.5rem' }}>
              <div>
                <label className="label">Recipe Name *</label>
                <input 
                  value={form.name} 
                  onChange={e => setForm({ ...form, name: e.target.value })} 
                  className="input" 
                  placeholder="e.g., Spaghetti Carbonara"
                />
              </div>
              
              <div>
                <label className="label">Description</label>
                <textarea 
                  value={form.description} 
                  onChange={e => setForm({ ...form, description: e.target.value })} 
                  className="input textarea" 
                  rows="3"
                  placeholder="Brief description of the recipe..."
                />
              </div>
            </div>

            {/* Recipe Details */}
            <div className={`grid gap-md ${isMobile ? '' : 'grid-cols-3'}`} style={{ marginBottom: '1.5rem' }}>
              <div>
                <label className="label">Servings</label>
                <input 
                  type="number" 
                  min="1"
                  value={form.servings} 
                  onChange={e => setForm({ ...form, servings: parseInt(e.target.value) || 1 })} 
                  className="input" 
                />
              </div>
              <div>
                <label className="label">Prep Time (min)</label>
                <input 
                  type="number" 
                  min="0"
                  value={form.prep_time} 
                  onChange={e => setForm({ ...form, prep_time: parseInt(e.target.value) || 0 })} 
                  className="input" 
                />
              </div>
              <div>
                <label className="label">Cook Time (min)</label>
                <input 
                  type="number" 
                  min="0"
                  value={form.cook_time} 
                  onChange={e => setForm({ ...form, cook_time: parseInt(e.target.value) || 0 })} 
                  className="input" 
                />
              </div>
            </div>

            {/* Categories */}
            <div className={`grid gap-md ${isMobile ? '' : 'grid-cols-3'}`} style={{ marginBottom: '1.5rem' }}>
              <div>
                <label className="label">Recipe Type</label>
                <select 
                  value={form.recipe_type} 
                  onChange={e => setForm({ ...form, recipe_type: e.target.value })} 
                  className="input select"
                >
                  {RECIPE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Cuisine</label>
                <select 
                  value={form.cuisine_type} 
                  onChange={e => setForm({ ...form, cuisine_type: e.target.value })} 
                  className="input select"
                >
                  <option value="">Select cuisine</option>
                  {CUISINES.filter(c => c).map(cuisine => (
                    <option key={cuisine} value={cuisine}>{cuisine}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select 
                  value={form.difficulty} 
                  onChange={e => setForm({ ...form, difficulty: e.target.value })} 
                  className="input select"
                >
                  {DIFFICULTIES.map(diff => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Nutritional Info */}
            <div className={`grid gap-md ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`} style={{ marginBottom: '1.5rem' }}>
              <div>
                <label className="label">Calories</label>
                <input 
                  type="number" 
                  min="0"
                  value={form.calories} 
                  onChange={e => setForm({ ...form, calories: parseInt(e.target.value) || 0 })} 
                  className="input" 
                />
              </div>
              <div>
                <label className="label">Protein (g)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.1"
                  value={form.protein} 
                  onChange={e => setForm({ ...form, protein: parseFloat(e.target.value) || 0 })} 
                  className="input" 
                />
              </div>
              <div>
                <label className="label">Carbs (g)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.1"
                  value={form.carbs} 
                  onChange={e => setForm({ ...form, carbs: parseFloat(e.target.value) || 0 })} 
                  className="input" 
                />
              </div>
              <div>
                <label className="label">Fat (g)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.1"
                  value={form.fat} 
                  onChange={e => setForm({ ...form, fat: parseFloat(e.target.value) || 0 })} 
                  className="input" 
                />
              </div>
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">Tags (comma-separated)</label>
              <input 
                value={(form.tags || []).join(', ')} 
                onChange={e => setForm({ ...form, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} 
                className="input" 
                placeholder="e.g., vegetarian, quick, comfort-food"
              />
            </div>

            {/* Instructions */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">Instructions</label>
              <textarea 
                value={form.instructions} 
                onChange={e => setForm({ ...form, instructions: e.target.value })} 
                className="input textarea" 
                rows="6"
                placeholder="Step-by-step cooking instructions..."
              />
            </div>

            {/* Ingredients */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                <label className="label" style={{ margin: 0 }}>Ingredients</label>
                <button onClick={addIngredient} className="btn btn-secondary btn-sm">
                  + Add Ingredient
                </button>
              </div>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {form.ingredients?.map((ing, i) => (
                  <div key={i} className={`grid gap-sm ${isMobile ? 'grid-cols-3' : 'grid-cols-5'}`} style={{ marginBottom: '0.5rem' }}>
                    <input 
                      placeholder="Name" 
                      value={ing.name} 
                      onChange={e => updateIngredient(i, 'name', e.target.value)} 
                      className="input"
                      style={{ gridColumn: isMobile ? 'span 2' : 'span 2' }}
                    />
                    <input 
                      placeholder="Qty" 
                      type="number" 
                      step="0.1"
                      min="0"
                      value={ing.quantity} 
                      onChange={e => updateIngredient(i, 'quantity', parseFloat(e.target.value) || 0)} 
                      className="input" 
                    />
                    {!isMobile && (
                      <input 
                        placeholder="Unit" 
                        value={ing.unit} 
                        onChange={e => updateIngredient(i, 'unit', e.target.value)} 
                        className="input" 
                      />
                    )}
                    {!isMobile && (
                      <select 
                        value={ing.category} 
                        onChange={e => updateIngredient(i, 'category', e.target.value)} 
                        className="input select"
                      >
                        {AISLE_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                    <button 
                      onClick={() => removeIngredient(i)} 
                      className="btn btn-ghost btn-sm text-danger"
                      style={{ padding: '0.25rem' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                
                {(!form.ingredients || form.ingredients.length === 0) && (
                  <div className="text-center text-muted" style={{ padding: '2rem' }}>
                    <p>No ingredients added yet</p>
                    <button onClick={addIngredient} className="btn btn-secondary btn-sm">
                      Add First Ingredient
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-md justify-end">
              <button onClick={() => setEditing(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={save} disabled={!form.name || loading} className="btn btn-primary">
                {loading ? 'Saving...' : 'Save Recipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}