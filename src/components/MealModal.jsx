import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from '../hooks/useLoading.jsx';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { value: 'lunch', label: 'Lunch', icon: '🥗' },
  { value: 'dinner', label: 'Dinner', icon: '🍽️' },
  { value: 'snack', label: 'Snack', icon: '🍿' },
];

export default function MealModal({ meal, newMealData, recipes, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    recipe_id: '',
    custom_name: '',
    notes: '',
    meal_type: 'dinner',
    ...newMealData
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (meal) {
      setFormData({
        recipe_id: meal.recipe_id || '',
        custom_name: meal.custom_name || '',
        notes: meal.notes || '',
        meal_type: meal.meal_type || 'dinner'
      });
    } else if (newMealData) {
      setFormData({
        recipe_id: '',
        custom_name: '',
        notes: '',
        meal_type: newMealData.meal_type || 'dinner'
      });
    }
    setErrors({});
  }, [meal, newMealData]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.recipe_id && !formData.custom_name.trim()) {
      newErrors.meal = 'Please select a recipe or enter a custom meal name';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const saveData = {
        recipe_id: formData.recipe_id || null,
        custom_name: formData.custom_name || '',
        notes: formData.notes || '',
        meal_type: formData.meal_type
      };

      await onSave(saveData);
    } catch (error) {
      console.error('Failed to save meal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecipeSelect = (recipeId) => {
    updateField('recipe_id', recipeId);
    if (recipeId) {
      updateField('custom_name', ''); // Clear custom name when recipe is selected
    }
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipe.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedRecipe = recipes.find(r => r.id === formData.recipe_id);
  const selectedMealType = MEAL_TYPES.find(mt => mt.value === formData.meal_type);

  const formatDate = (dateStr) => {
    if (!newMealData?.date && !meal?.date) return '';
    const date = new Date((newMealData?.date || meal?.date) + 'T12:00:00');
    return date.toLocaleDateString('en', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {meal ? 'Edit Meal' : 'Add Meal'}
            {(newMealData?.date || meal?.date) && (
              <div style={{ 
                fontSize: 'var(--font-base)', 
                fontWeight: 400, 
                color: 'var(--text-secondary)',
                marginTop: 'var(--spacing-xs)'
              }}>
                {formatDate()}
              </div>
            )}
          </h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
          {/* Meal Type */}
          <div>
            <label className="label label-required">Meal Type</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 'var(--spacing-sm)'
            }}>
              {MEAL_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => updateField('meal_type', type.value)}
                  className={formData.meal_type === type.value ? 'btn btn-primary' : 'btn btn-outline'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    justifyContent: 'center',
                    padding: 'var(--spacing-md)'
                  }}
                >
                  <span>{type.icon}</span>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recipe or Custom Meal Selection */}
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--spacing-md)'
            }}>
              <label className="label label-required">Meal</label>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <button
                  onClick={() => {
                    updateField('recipe_id', '');
                    setSearchTerm('');
                  }}
                  className={!formData.recipe_id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                >
                  Custom
                </button>
                <button
                  onClick={() => updateField('custom_name', '')}
                  className={formData.recipe_id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                >
                  Recipe
                </button>
              </div>
            </div>

            {errors.meal && <div className="error-text mb-md">{errors.meal}</div>}

            {/* Custom Meal Input */}
            {!formData.recipe_id && (
              <div>
                <input
                  type="text"
                  value={formData.custom_name}
                  onChange={(e) => updateField('custom_name', e.target.value)}
                  className={`input ${errors.meal ? 'input-error' : ''}`}
                  placeholder="Enter meal name (e.g., Leftover pizza, Sandwich)"
                />
              </div>
            )}

            {/* Recipe Selection */}
            {formData.recipe_id || (!formData.custom_name && !formData.recipe_id) ? (
              <div>
                {/* Recipe Search */}
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input"
                    placeholder="Search recipes..."
                    style={{ position: 'relative' }}
                  />
                </div>

                {/* Selected Recipe Display */}
                {selectedRecipe && (
                  <div style={{
                    padding: 'var(--spacing-lg)',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--spacing-md)',
                    border: '2px solid var(--primary)'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      gap: 'var(--spacing-md)'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{
                          fontSize: 'var(--font-lg)',
                          color: 'var(--text-primary)',
                          margin: 0,
                          marginBottom: 'var(--spacing-xs)'
                        }}>
                          ✅ {selectedRecipe.name}
                        </h4>
                        <p style={{
                          color: 'var(--text-secondary)',
                          fontSize: 'var(--font-sm)',
                          margin: 0,
                          marginBottom: 'var(--spacing-sm)'
                        }}>
                          {selectedRecipe.description || 'No description'}
                        </p>
                        <div style={{
                          display: 'flex',
                          gap: 'var(--spacing-md)',
                          fontSize: 'var(--font-sm)',
                          color: 'var(--text-muted)'
                        }}>
                          <span>⏱️ {(selectedRecipe.prep_time || 0) + (selectedRecipe.cook_time || 0)}m</span>
                          <span>👥 {selectedRecipe.servings} servings</span>
                          {selectedRecipe.difficulty && (
                            <span>📊 {selectedRecipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => updateField('recipe_id', '')}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--error)' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Recipe List */}
                {!selectedRecipe && (
                  <div style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    {filteredRecipes.length > 0 ? (
                      <div>
                        {filteredRecipes.map(recipe => (
                          <div
                            key={recipe.id}
                            onClick={() => handleRecipeSelect(recipe.id)}
                            style={{
                              padding: 'var(--spacing-md)',
                              borderBottom: '1px solid var(--border-primary)',
                              cursor: 'pointer',
                              transition: 'var(--transition-fast)',
                              ':hover': {
                                background: 'var(--bg-tertiary)'
                              }
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'var(--bg-tertiary)'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'start',
                              gap: 'var(--spacing-md)'
                            }}>
                              <div style={{ flex: 1 }}>
                                <div style={{
                                  fontSize: 'var(--font-base)',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  marginBottom: 'var(--spacing-xs)'
                                }}>
                                  {recipe.name}
                                  {recipe.is_favorite && <span style={{ marginLeft: 'var(--spacing-xs)' }}>❤️</span>}
                                </div>
                                <div style={{
                                  fontSize: 'var(--font-sm)',
                                  color: 'var(--text-secondary)',
                                  marginBottom: 'var(--spacing-xs)'
                                }}>
                                  {recipe.description || 'No description'}
                                </div>
                                <div style={{
                                  display: 'flex',
                                  gap: 'var(--spacing-md)',
                                  fontSize: 'var(--font-xs)',
                                  color: 'var(--text-muted)'
                                }}>
                                  <span>⏱️ {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m</span>
                                  <span>👥 {recipe.servings}</span>
                                  <span>🧾 {recipe.ingredients?.length || 0}</span>
                                </div>
                                {recipe.tags?.length > 0 && (
                                  <div style={{
                                    display: 'flex',
                                    gap: 'var(--spacing-xs)',
                                    marginTop: 'var(--spacing-xs)',
                                    flexWrap: 'wrap'
                                  }}>
                                    {recipe.tags.slice(0, 3).map((tag, i) => (
                                      <span key={i} className="tag tag-primary">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        padding: 'var(--spacing-2xl)',
                        textAlign: 'center',
                        color: 'var(--text-muted)'
                      }}>
                        {searchTerm ? 'No recipes match your search' : 'No recipes available'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="input textarea"
              placeholder="Special instructions, modifications, or reminders..."
              rows="3"
            />
          </div>

          {/* Summary */}
          {(formData.recipe_id || formData.custom_name) && (
            <div style={{
              padding: 'var(--spacing-lg)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)'
            }}>
              <h4 style={{
                margin: 0,
                marginBottom: 'var(--spacing-sm)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-base)'
              }}>
                Meal Summary
              </h4>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-sm)'
              }}>
                <span style={{ fontSize: '20px' }}>{selectedMealType?.icon}</span>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {selectedRecipe?.name || formData.custom_name}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                    {selectedMealType?.label} • {formatDate()}
                  </div>
                </div>
              </div>
              {formData.notes && (
                <div style={{
                  fontSize: 'var(--font-sm)',
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic'
                }}>
                  Note: {formData.notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div style={{
          display: 'flex',
          gap: 'var(--spacing-md)',
          marginTop: 'var(--spacing-xl)',
          paddingTop: 'var(--spacing-lg)',
          borderTop: '1px solid var(--border-primary)'
        }}>
          <button
            onClick={handleSave}
            className="btn btn-primary"
            disabled={loading || (!formData.recipe_id && !formData.custom_name.trim())}
            style={{ flex: 1 }}
          >
            {loading && <LoadingSpinner />}
            {loading ? 'Saving...' : (meal ? 'Update Meal' : 'Add Meal')}
          </button>
          
          <button
            onClick={onCancel}
            className="btn btn-outline"
            disabled={loading}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}