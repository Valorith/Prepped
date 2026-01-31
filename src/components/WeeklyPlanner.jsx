import React, { useState, useEffect, useMemo } from 'react'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_COLORS = { 
  breakfast: 'var(--meal-breakfast)', 
  lunch: 'var(--meal-lunch)', 
  dinner: 'var(--meal-dinner)', 
  snack: 'var(--meal-snack)' 
}

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
  const [adding, setAdding] = useState(null) // { date, meal_type }
  const [form, setForm] = useState({ recipe_id: '', custom_name: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', description: '' })
  const [draggedMeal, setDraggedMeal] = useState(null)

  const dates = getWeekDates(weekOffset)
  const start = dates[0], end = dates[6]

  useEffect(() => {
    loadData()
  }, [start, end])

  const loadData = async () => {
    try {
      setLoading(true)
      const [mealsRes, recipesRes, templatesRes] = await Promise.all([
        fetch(`/api/meals?start=${start}&end=${end}`),
        fetch('/api/recipes'),
        fetch('/api/meal-templates')
      ])
      
      if (!mealsRes.ok || !recipesRes.ok || !templatesRes.ok) {
        throw new Error('Failed to load data')
      }
      
      const [mealsData, recipesData, templatesData] = await Promise.all([
        mealsRes.json(),
        recipesRes.json(),
        templatesRes.json()
      ])
      
      setMeals(mealsData)
      setRecipes(recipesData)
      setTemplates(templatesData)
    } catch (error) {
      console.error('Error loading data:', error)
      addToast('Failed to load meal plan data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addMeal = async () => {
    if (!adding) return
    
    try {
      const body = { ...form, date: adding.date, meal_type: adding.meal_type }
      if (!body.recipe_id && !body.custom_name) {
        addToast('Please select a recipe or enter a custom name', 'error')
        return
      }
      
      if (!body.recipe_id) body.recipe_id = null
      
      const res = await fetch('/api/meals', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(body) 
      })
      
      if (!res.ok) throw new Error('Failed to add meal')
      
      const meal = await res.json()
      setMeals(prev => [...prev, meal])
      setAdding(null)
      setForm({ recipe_id: '', custom_name: '', notes: '' })
      addToast('Meal added successfully!', 'success')
    } catch (error) {
      console.error('Error adding meal:', error)
      addToast('Failed to add meal', 'error')
    }
  }

  const removeMeal = async (id) => {
    try {
      const res = await fetch(`/api/meals/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove meal')
      
      setMeals(prev => prev.filter(m => m.id !== id))
      addToast('Meal removed', 'success')
    } catch (error) {
      console.error('Error removing meal:', error)
      addToast('Failed to remove meal', 'error')
    }
  }

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) {
      addToast('Template name is required', 'error')
      return
    }
    
    try {
      const res = await fetch('/api/meal-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name,
          description: templateForm.description,
          start_date: start,
          end_date: end
        })
      })
      
      if (!res.ok) throw new Error('Failed to save template')
      
      const template = await res.json()
      setTemplates(prev => [...prev, template])
      setTemplateForm({ name: '', description: '' })
      addToast('Template saved successfully!', 'success')
    } catch (error) {
      console.error('Error saving template:', error)
      addToast('Failed to save template', 'error')
    }
  }

  const applyTemplate = async (templateId, clearExisting = false) => {
    try {
      const res = await fetch(`/api/meal-templates/${templateId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: start,
          clear_existing: clearExisting
        })
      })
      
      if (!res.ok) throw new Error('Failed to apply template')
      
      const result = await res.json()
      await loadData() // Reload to show updated meals
      addToast(`Template applied! Added ${result.added_meals} meals`, 'success')
    } catch (error) {
      console.error('Error applying template:', error)
      addToast('Failed to apply template', 'error')
    }
  }

  const deleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return
    
    try {
      const res = await fetch(`/api/meal-templates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete template')
      
      setTemplates(prev => prev.filter(t => t.id !== id))
      addToast('Template deleted', 'success')
    } catch (error) {
      console.error('Error deleting template:', error)
      addToast('Failed to delete template', 'error')
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e, meal) => {
    setDraggedMeal(meal)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, targetDate, targetMealType) => {
    e.preventDefault()
    
    if (!draggedMeal) return
    
    try {
      const res = await fetch(`/api/meals/${draggedMeal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draggedMeal,
          date: targetDate,
          meal_type: targetMealType
        })
      })
      
      if (!res.ok) throw new Error('Failed to move meal')
      
      const updatedMeal = await res.json()
      setMeals(prev => prev.map(m => m.id === updatedMeal.id ? updatedMeal : m))
      addToast('Meal moved successfully!', 'success')
    } catch (error) {
      console.error('Error moving meal:', error)
      addToast('Failed to move meal', 'error')
    } finally {
      setDraggedMeal(null)
    }
  }

  const weekLabel = useMemo(() => {
    const s = new Date(start), e = new Date(end)
    const mo = s.toLocaleString('default', { month: 'short' })
    const endMo = e.toLocaleString('default', { month: 'short' })
    
    if (s.getMonth() === e.getMonth()) {
      return `${mo} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`
    } else {
      return `${mo} ${s.getDate()} – ${endMo} ${e.getDate()}, ${s.getFullYear()}`
    }
  }, [start, end])

  const generateShoppingList = async () => {
    try {
      const res = await fetch('/api/shopping/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, clear_existing: false })
      })
      
      if (!res.ok) throw new Error('Failed to generate shopping list')
      
      const result = await res.json()
      addToast(`Shopping list updated! Added ${result.added_count} items`, 'success')
    } catch (error) {
      console.error('Error generating shopping list:', error)
      addToast('Failed to generate shopping list', 'error')
    }
  }

  const MealCard = ({ meal, onRemove }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, meal)}
      className="card-compact"
      style={{
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem',
        marginBottom: '0.25rem',
        borderLeft: `3px solid ${MEAL_COLORS[meal.meal_type] || 'var(--border-primary)'}`,
        position: 'relative',
        cursor: 'move',
        transition: 'var(--transition-fast)'
      }}
    >
      <div className="text-sm font-medium text-primary" style={{ marginBottom: '0.125rem' }}>
        {meal.recipe_name || meal.custom_name || 'Untitled'}
      </div>
      <div className="text-xs text-muted">
        {meal.meal_type}
        {meal.prep_time && meal.cook_time && (
          <span> • {meal.prep_time + meal.cook_time}m</span>
        )}
        {meal.servings && (
          <span> • {meal.servings} servings</span>
        )}
      </div>
      {meal.notes && (
        <div className="text-xs text-secondary" style={{ marginTop: '0.25rem' }}>
          {meal.notes}
        </div>
      )}
      <button
        onClick={() => onRemove(meal.id)}
        className="btn-ghost"
        style={{
          position: 'absolute',
          top: '2px',
          right: '4px',
          padding: '0',
          minHeight: '16px',
          width: '16px',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}
      >
        ×
      </button>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'mobile-stack' : ''}`} 
           style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div className="flex items-center gap-md">
          <button onClick={() => setWeekOffset(w => w - 1)} className="btn btn-secondary">
            ← Prev
          </button>
          <h2 className="text-xl font-bold text-primary" style={{ margin: 0 }}>
            {weekLabel}
          </h2>
          <button onClick={() => setWeekOffset(w => w + 1)} className="btn btn-secondary">
            Next →
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="btn btn-ghost btn-sm">
              Today
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-sm">
          <button 
            onClick={() => setShowTemplates(!showTemplates)} 
            className="btn btn-secondary btn-sm"
          >
            📋 Templates
          </button>
          <button 
            onClick={generateShoppingList} 
            className="btn btn-success btn-sm"
          >
            🛒 Generate Shopping List
          </button>
        </div>
      </div>

      {/* Templates Panel */}
      {showTemplates && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="text-lg font-semibold text-primary" style={{ marginBottom: '1rem' }}>
            📋 Meal Plan Templates
          </h3>
          
          {/* Save Current Week as Template */}
          <div className="card-compact bg-secondary" style={{ marginBottom: '1rem' }}>
            <h4 className="text-base font-medium" style={{ marginBottom: '0.5rem' }}>
              Save Current Week as Template
            </h4>
            <div className={`grid gap-sm ${isMobile ? '' : 'grid-cols-3'}`} style={{ marginBottom: '0.75rem' }}>
              <input
                placeholder="Template name"
                value={templateForm.name}
                onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                className="input"
              />
              <input
                placeholder="Description (optional)"
                value={templateForm.description}
                onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                className="input"
                style={{ gridColumn: isMobile ? '1' : 'span 2' }}
              />
            </div>
            <button
              onClick={saveTemplate}
              disabled={!templateForm.name.trim()}
              className="btn btn-primary btn-sm"
            >
              💾 Save Template
            </button>
          </div>

          {/* Existing Templates */}
          {templates.length > 0 ? (
            <div className="grid gap-sm">
              {templates.map(template => (
                <div key={template.id} className="card-compact bg-tertiary">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{template.name}</div>
                      {template.description && (
                        <div className="text-xs text-muted">{template.description}</div>
                      )}
                      <div className="text-xs text-muted">
                        {template.template_data?.length || 0} meals • 
                        Created {new Date(template.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-sm">
                      <button
                        onClick={() => applyTemplate(template.id, false)}
                        className="btn btn-success btn-sm"
                        title="Apply template (add to existing meals)"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('This will replace all meals for this week. Continue?')) {
                            applyTemplate(template.id, true)
                          }
                        }}
                        className="btn btn-warning btn-sm"
                        title="Apply template (replace all meals)"
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="btn btn-ghost btn-sm text-danger"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted" style={{ padding: '1rem' }}>
              <p>No templates saved yet</p>
              <p className="text-xs">Plan out a week and save it as a template for reuse!</p>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center" style={{ padding: '2rem' }}>
          <div className="loader" style={{ margin: '0 auto 1rem' }}></div>
          <p className="text-secondary">Loading meal plan...</p>
        </div>
      )}

      {/* Weekly Grid */}
      {!loading && (
        <div className={`grid gap-md ${isMobile ? '' : 'grid-cols-7'}`}>
          {dates.map((date, dayIndex) => {
            const isToday = date === new Date().toISOString().split('T')[0]
            const dayMeals = meals.filter(m => m.date === date)
            const mealsByType = MEAL_TYPES.reduce((acc, type) => {
              acc[type] = dayMeals.filter(m => m.meal_type === type)
              return acc
            }, {})
            
            return (
              <div key={date} className="card card-compact" style={{ 
                borderColor: isToday ? 'var(--color-primary)' : 'var(--border-primary)',
                minHeight: '200px'
              }}>
                {/* Day Header */}
                <div className="text-center" style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '0.5rem' }}>
                  <div className="text-xs text-muted">
                    {isMobile ? DAY_NAMES_SHORT[dayIndex] : DAY_NAMES[dayIndex]}
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>
                    {new Date(date + 'T12:00').getDate()}
                  </div>
                </div>

                {/* Meal Types */}
                {MEAL_TYPES.map(mealType => (
                  <div 
                    key={mealType}
                    style={{ marginBottom: '0.5rem' }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, date, mealType)}
                  >
                    <div className="text-xs font-medium text-muted" style={{ marginBottom: '0.25rem' }}>
                      {mealType.toUpperCase()}
                    </div>
                    
                    {mealsByType[mealType].map(meal => (
                      <MealCard key={meal.id} meal={meal} onRemove={removeMeal} />
                    ))}
                    
                    <button
                      onClick={() => setAdding({ date, meal_type: mealType })}
                      className="btn btn-ghost btn-sm"
                      style={{
                        width: '100%',
                        border: '1px dashed var(--border-primary)',
                        color: 'var(--text-muted)',
                        padding: '0.25rem',
                        fontSize: '12px',
                        marginTop: '0.125rem'
                      }}
                    >
                      + Add {mealType}
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Meal Modal */}
      {adding && (
        <div className="modal-overlay" onClick={() => setAdding(null)}>
          <div className="modal" style={{ width: isMobile ? '100%' : '400px' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary" style={{ marginBottom: '1rem' }}>
              Add {adding.meal_type} — {new Date(adding.date).toLocaleDateString()}
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Recipe</label>
              <select 
                value={form.recipe_id} 
                onChange={e => setForm({ ...form, recipe_id: e.target.value })} 
                className="input select"
              >
                <option value="">— Custom meal (no recipe) —</option>
                {recipes
                  .filter(r => !form.recipe_id || r.recipe_type === adding.meal_type || r.id === form.recipe_id)
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.recipe_type})
                    </option>
                  ))
                }
              </select>
            </div>

            {!form.recipe_id && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="label">Custom Name</label>
                <input 
                  value={form.custom_name} 
                  onChange={e => setForm({ ...form, custom_name: e.target.value })} 
                  className="input" 
                  placeholder="e.g., Leftovers, Restaurant meal"
                />
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Notes (optional)</label>
              <input 
                value={form.notes} 
                onChange={e => setForm({ ...form, notes: e.target.value })} 
                className="input" 
                placeholder="Special notes or modifications"
              />
            </div>

            <div className="flex gap-md justify-end">
              <button onClick={() => setAdding(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button 
                onClick={addMeal} 
                disabled={!form.recipe_id && !form.custom_name.trim()}
                className="btn btn-primary"
              >
                Add Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}