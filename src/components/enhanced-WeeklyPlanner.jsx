import React, { useState, useEffect, useMemo } from 'react'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_COLORS = { 
  breakfast: 'var(--meal-breakfast)', lunch: 'var(--meal-lunch)', 
  dinner: 'var(--meal-dinner)', snack: 'var(--meal-snack)' 
}
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍪' }

function getWeekDates(offset = 0) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeeklyPlanner({ addToast, isMobile }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [meals, setMeals] = useState([])
  const [recipes, setRecipes] = useState([])
  const [templates, setTemplates] = useState([])
  const [adding, setAdding] = useState(null)
  const [form, setForm] = useState({ recipe_id: '', custom_name: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', description: '' })
  const [draggedMeal, setDraggedMeal] = useState(null)
  const [nutrition, setNutrition] = useState(null)
  const [showNutrition, setShowNutrition] = useState(false)
  const [recipeSearch, setRecipeSearch] = useState('')

  const dates = getWeekDates(weekOffset)
  const start = dates[0], end = dates[6]

  useEffect(() => { loadData() }, [start, end])

  const loadData = async () => {
    try {
      setLoading(true)
      const [mealsRes, recipesRes, templatesRes] = await Promise.all([
        fetch(`/api/meals?start=${start}&end=${end}`),
        fetch('/api/recipes'),
        fetch('/api/meal-templates')
      ])
      const [mealsData, recipesData, templatesData] = await Promise.all([
        mealsRes.json(), recipesRes.json(), templatesRes.json()
      ])
      setMeals((mealsData || []).map(m => ({ ...m, date: typeof m.date === 'string' ? m.date.split('T')[0] : new Date(m.date).toISOString().split('T')[0] })))
      setRecipes(recipesData)
      setTemplates(templatesData)
    } catch { addToast('Failed to load meal plan data', 'error') }
    finally { setLoading(false) }
  }

  const loadNutrition = async () => {
    try {
      const res = await fetch(`/api/meals/nutrition?start=${start}&end=${end}`)
      if (res.ok) setNutrition(await res.json())
    } catch { /* silently fail */ }
  }

  useEffect(() => { if (showNutrition) loadNutrition() }, [showNutrition, start, end, meals])

  const addMeal = async () => {
    if (!adding) return
    try {
      const body = { ...form, date: adding.date, meal_type: adding.meal_type }
      if (!body.recipe_id && !body.custom_name) { addToast('Select a recipe or enter a name', 'error'); return }
      if (!body.recipe_id) body.recipe_id = null
      const res = await fetch('/api/meals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error()
      const meal = await res.json()
      const normalizedMeal = { ...meal, date: typeof meal.date === 'string' ? meal.date.split('T')[0] : new Date(meal.date).toISOString().split('T')[0] }
      setMeals(prev => [...prev, normalizedMeal])
      setAdding(null)
      setForm({ recipe_id: '', custom_name: '', notes: '' })
      setRecipeSearch('')
      addToast('Meal added!', 'success')
    } catch { addToast('Failed to add meal', 'error') }
  }

  const removeMeal = async (id) => {
    try {
      await fetch(`/api/meals/${id}`, { method: 'DELETE' })
      setMeals(prev => prev.filter(m => m.id !== id))
      addToast('Meal removed', 'success')
    } catch { addToast('Failed to remove meal', 'error') }
  }

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) { addToast('Name required', 'error'); return }
    try {
      const res = await fetch('/api/meal-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateForm.name, description: templateForm.description, start_date: start, end_date: end })
      })
      const template = await res.json()
      setTemplates(prev => [...prev, template])
      setTemplateForm({ name: '', description: '' })
      addToast('Template saved!', 'success')
    } catch { addToast('Failed to save template', 'error') }
  }

  const applyTemplate = async (templateId, clearExisting = false) => {
    try {
      const res = await fetch(`/api/meal-templates/${templateId}/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: start, clear_existing: clearExisting })
      })
      const result = await res.json()
      await loadData()
      addToast(`Applied! ${result.added_meals} meals added`, 'success')
    } catch { addToast('Failed to apply template', 'error') }
  }

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return
    try {
      await fetch(`/api/meal-templates/${id}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.id !== id))
      addToast('Template deleted', 'success')
    } catch { addToast('Failed to delete template', 'error') }
  }

  const handleDragStart = (e, meal) => { setDraggedMeal(meal); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over') }
  const handleDragLeave = (e) => { e.currentTarget.classList.remove('drag-over') }
  const handleDrop = async (e, targetDate, targetMealType) => {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')
    if (!draggedMeal) return
    try {
      const res = await fetch(`/api/meals/${draggedMeal.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draggedMeal, date: targetDate, meal_type: targetMealType })
      })
      const updatedMeal = await res.json()
      const normalizedUpdated = { ...updatedMeal, date: typeof updatedMeal.date === 'string' ? updatedMeal.date.split('T')[0] : new Date(updatedMeal.date).toISOString().split('T')[0] }
      setMeals(prev => prev.map(m => m.id === normalizedUpdated.id ? normalizedUpdated : m))
      addToast('Meal moved!', 'success')
    } catch { addToast('Failed to move meal', 'error') }
    finally { setDraggedMeal(null) }
  }

  const weekLabel = useMemo(() => {
    const s = new Date(start), e = new Date(end)
    const mo = s.toLocaleString('default', { month: 'short' })
    const endMo = e.toLocaleString('default', { month: 'short' })
    return s.getMonth() === e.getMonth()
      ? `${mo} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`
      : `${mo} ${s.getDate()} – ${endMo} ${e.getDate()}, ${s.getFullYear()}`
  }, [start, end])

  const generateShoppingList = async () => {
    try {
      const res = await fetch('/api/shopping/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, clear_existing: false })
      })
      const result = await res.json()
      addToast(`Shopping list updated! ${result.added_count} items added`, 'success')
    } catch { addToast('Failed to generate shopping list', 'error') }
  }

  const filteredRecipes = useMemo(() => {
    if (!recipeSearch) return recipes
    const s = recipeSearch.toLowerCase()
    return recipes.filter(r => r.name.toLowerCase().includes(s) || (r.cuisine_type || '').toLowerCase().includes(s))
  }, [recipes, recipeSearch])

  const totalMeals = meals.length
  const mealsByDay = dates.reduce((acc, d) => { acc[d] = meals.filter(m => m.date === d).length; return acc }, {})

  const MealCard = ({ meal }) => (
    <div draggable onDragStart={(e) => handleDragStart(e, meal)}
      style={{
        background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '0.4rem 0.5rem',
        marginBottom: '0.25rem', borderLeft: `3px solid ${MEAL_COLORS[meal.meal_type] || 'var(--border-primary)'}`,
        position: 'relative', cursor: 'move', transition: 'all 0.15s ease',
        fontSize: '0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'flex-start'
      }}
      className="meal-card">
      {meal.recipe_image && (
        <img src={meal.recipe_image} alt="" style={{
          width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0
        }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.1rem', paddingRight: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meal.recipe_name || meal.custom_name || 'Untitled'}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
          {meal.prep_time && meal.cook_time ? `${meal.prep_time + meal.cook_time}m` : ''}
          {meal.servings ? ` • ${meal.servings} srv` : ''}
        </div>
      </div>
      <button onClick={() => removeMeal(meal.id)} className="btn-ghost"
        style={{ position: 'absolute', top: 2, right: 4, padding: 0, minHeight: 16, width: 16, fontSize: 12, color: 'var(--text-muted)' }}>×</button>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'mobile-stack' : ''}`} style={{ marginBottom: '1.25rem', gap: '0.75rem' }}>
        <div className="flex items-center gap-md" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} className="btn btn-secondary btn-sm">← Prev</button>
          <h2 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{weekLabel}</h2>
          <button onClick={() => setWeekOffset(w => w + 1)} className="btn btn-secondary btn-sm">Next →</button>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="btn btn-ghost btn-sm">Today</button>}
        </div>
        <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setShowNutrition(!showNutrition)} className={`btn btn-sm ${showNutrition ? 'btn-primary' : 'btn-secondary'}`}>
            📊 Nutrition
          </button>
          <button onClick={() => setShowTemplates(!showTemplates)} className="btn btn-secondary btn-sm">📋 Templates</button>
          <button onClick={generateShoppingList} className="btn btn-success btn-sm">🛒 Shopping List</button>
        </div>
      </div>

      {/* Week Summary */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-sm text-muted">{totalMeals} meal{totalMeals !== 1 ? 's' : ''} planned this week</span>
        {totalMeals > 0 && (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {MEAL_TYPES.map(type => {
              const count = meals.filter(m => m.meal_type === type).length
              return count > 0 ? (
                <span key={type} className="tag" style={{ fontSize: '0.65rem', background: MEAL_COLORS[type], color: 'white' }}>
                  {MEAL_ICONS[type]} {count}
                </span>
              ) : null
            })}
          </div>
        )}
      </div>

      {/* Nutritional Summary */}
      {showNutrition && nutrition && (
        <div className="card" style={{ marginBottom: '1.25rem', animation: 'slideUp 0.2s ease' }}>
          <h3 style={{ margin: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>📊 Weekly Nutrition Summary</h3>
          
          {/* Weekly totals */}
          <div className="nutrition-bar" style={{ marginBottom: '1rem' }}>
            <div className="nutrition-item">
              <span className="nutrition-value" style={{ color: 'var(--color-danger)', fontSize: '1.25rem' }}>{nutrition.weekly.calories}</span>
              <span className="nutrition-label">Total Cal</span>
            </div>
            <div className="nutrition-item">
              <span className="nutrition-value" style={{ color: 'var(--color-info)' }}>{nutrition.weekly.protein.toFixed(0)}g</span>
              <span className="nutrition-label">Protein</span>
            </div>
            <div className="nutrition-item">
              <span className="nutrition-value" style={{ color: 'var(--color-accent)' }}>{nutrition.weekly.carbs.toFixed(0)}g</span>
              <span className="nutrition-label">Carbs</span>
            </div>
            <div className="nutrition-item">
              <span className="nutrition-value" style={{ color: 'var(--color-warning)' }}>{nutrition.weekly.fat.toFixed(0)}g</span>
              <span className="nutrition-label">Fat</span>
            </div>
            <div className="nutrition-item">
              <span className="nutrition-value" style={{ color: 'var(--text-secondary)' }}>{nutrition.weekly.meals}</span>
              <span className="nutrition-label">Meals</span>
            </div>
            {nutrition.weekly.meals > 0 && (
              <div className="nutrition-item">
                <span className="nutrition-value" style={{ color: 'var(--color-primary)' }}>
                  {Math.round(nutrition.weekly.calories / Math.max(Object.keys(nutrition.daily).length, 1))}
                </span>
                <span className="nutrition-label">Cal/Day Avg</span>
              </div>
            )}
          </div>

          {/* Daily breakdown */}
          {Object.keys(nutrition.daily).length > 0 && (
            <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)' }}>
              {dates.map((date, i) => {
                const day = nutrition.daily[date]
                return (
                  <div key={date} style={{
                    padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                    textAlign: 'center', opacity: day ? 1 : 0.4
                  }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{DAY_NAMES_SHORT[i]}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: day ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                      {day ? day.calories : '—'}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>cal</div>
                  </div>
                )
              })}
            </div>
          )}

          {nutrition.weekly.meals === 0 && (
            <p className="text-sm text-muted" style={{ textAlign: 'center', margin: '0.5rem 0 0' }}>
              No recipes with nutrition data planned this week. Add nutrition info to your recipes to see the summary.
            </p>
          )}
        </div>
      )}

      {/* Templates Panel */}
      {showTemplates && (
        <div className="card" style={{ marginBottom: '1.25rem', animation: 'slideUp 0.2s ease' }}>
          <h3 style={{ margin: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>📋 Meal Plan Templates</h3>
          
          <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Save Current Week</div>
            <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr auto' }}>
              <input placeholder="Template name" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} className="input" />
              <input placeholder="Description (optional)" value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} className="input" />
              <button onClick={saveTemplate} disabled={!templateForm.name.trim()} className="btn btn-primary btn-sm">💾 Save</button>
            </div>
          </div>

          {templates.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {templates.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t.template_data?.length || 0} meals • {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button onClick={() => applyTemplate(t.id, false)} className="btn btn-success btn-sm">Apply</button>
                    <button onClick={() => { if (window.confirm('Replace all meals?')) applyTemplate(t.id, true) }} className="btn btn-secondary btn-sm">Replace</button>
                    <button onClick={() => deleteTemplate(t.id)} className="btn btn-ghost btn-sm text-danger">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted" style={{ textAlign: 'center' }}>No templates yet. Plan a week and save it!</p>}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="empty-state">
          <div className="loader" style={{ margin: '0 auto 1rem', width: 32, height: 32 }}></div>
          <p className="text-secondary">Loading meal plan...</p>
        </div>
      )}

      {/* Weekly Grid */}
      {!loading && (
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, 1fr)' }}>
          {dates.map((date, dayIndex) => {
            const isToday = date === new Date().toISOString().split('T')[0]
            const dayMeals = meals.filter(m => m.date === date)
            const mealsByType = MEAL_TYPES.reduce((acc, type) => {
              acc[type] = dayMeals.filter(m => m.meal_type === type)
              return acc
            }, {})

            return (
              <div key={date} className="card" style={{
                padding: '0.6rem', borderColor: isToday ? 'var(--color-primary)' : 'var(--border-primary)',
                minHeight: 200, boxShadow: isToday ? '0 0 0 1px var(--color-primary)' : 'none'
              }}>
                {/* Day Header */}
                <div style={{ textAlign: 'center', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isMobile ? DAY_NAMES[dayIndex] : DAY_NAMES_SHORT[dayIndex]}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isToday ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                    {new Date(date + 'T12:00').getDate()}
                  </div>
                </div>

                {/* Meal Types */}
                {MEAL_TYPES.map(mealType => (
                  <div key={mealType} style={{ marginBottom: '0.35rem' }}
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date, mealType)}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 600, color: MEAL_COLORS[mealType], marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {MEAL_ICONS[mealType]} {mealType}
                    </div>
                    {mealsByType[mealType].map(meal => <MealCard key={meal.id} meal={meal} />)}
                    <button onClick={() => { setAdding({ date, meal_type: mealType }); setRecipeSearch('') }}
                      style={{
                        width: '100%', border: '1px dashed var(--border-secondary)', background: 'transparent',
                        color: 'var(--text-muted)', padding: '0.2rem', fontSize: '0.65rem', borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer', transition: 'all 0.15s ease', marginTop: 2
                      }}
                      className="add-meal-btn">+</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Meal Modal */}
      {adding && (
        <div className="modal-overlay" onClick={() => { setAdding(null); setRecipeSearch('') }}>
          <div className="modal" style={{ width: isMobile ? '100%' : '420px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {MEAL_ICONS[adding.meal_type]} Add {adding.meal_type} — {new Date(adding.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </h3>

            {/* Recipe search */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="label">Recipe</label>
              <input
                value={recipeSearch}
                onChange={(e) => { setRecipeSearch(e.target.value); if (form.recipe_id) setForm(f => ({ ...f, recipe_id: '' })) }}
                placeholder="Search recipes..."
                className="input"
              />
              {recipeSearch && !form.recipe_id && (
                <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: '0.35rem', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                  {filteredRecipes.slice(0, 10).map(r => (
                    <button key={r.id} onClick={() => { setForm(f => ({ ...f, recipe_id: r.id })); setRecipeSearch(r.name) }}
                      style={{
                        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                        padding: '0.5rem 0.75rem', color: 'var(--text-primary)', cursor: 'pointer',
                        fontSize: '0.85rem', borderBottom: '1px solid var(--border-primary)'
                      }}
                      className="recipe-option">
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {r.recipe_type} {r.cuisine_type && `• ${r.cuisine_type}`} {r.prep_time + r.cook_time > 0 && `• ${r.prep_time + r.cook_time}m`}
                      </div>
                    </button>
                  ))}
                  {filteredRecipes.length === 0 && (
                    <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No recipes match</div>
                  )}
                </div>
              )}
              {form.recipe_id && (
                <div style={{ marginTop: '0.35rem', padding: '0.4rem 0.6rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="text-sm">✅ {recipeSearch}</span>
                  <button onClick={() => { setForm(f => ({ ...f, recipe_id: '' })); setRecipeSearch('') }} className="btn btn-ghost btn-sm" style={{ padding: 2, minHeight: 'auto' }}>×</button>
                </div>
              )}
            </div>

            {/* Custom meal or select from full list */}
            {!form.recipe_id && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Or enter a custom meal</label>
                <input value={form.custom_name} onChange={e => setForm({ ...form, custom_name: e.target.value })}
                  className="input" placeholder="e.g., Leftovers, Restaurant meal" />
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input" placeholder="Special notes..." />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setAdding(null); setRecipeSearch('') }} className="btn btn-secondary">Cancel</button>
              <button onClick={addMeal} disabled={!form.recipe_id && !form.custom_name.trim()} className="btn btn-primary">Add Meal</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .meal-card:hover { background: var(--bg-card-hover) !important; }
        .add-meal-btn:hover { background: var(--bg-tertiary) !important; border-color: var(--color-primary) !important; color: var(--color-primary) !important; }
        .recipe-option:hover { background: var(--bg-tertiary) !important; }
      `}</style>
    </div>
  )
}
