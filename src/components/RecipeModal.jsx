import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from '../hooks/useLoading.jsx';

const INGREDIENT_CATEGORIES = [
  'produce', 'meat', 'dairy', 'grains', 'pantry', 'spices', 'condiments', 'frozen', 'other'
];

const DIFFICULTY_LEVELS = [
  { value: 'easy', label: 'Easy', description: 'Simple preparation, few ingredients' },
  { value: 'medium', label: 'Medium', description: 'Some cooking skills required' },
  { value: 'hard', label: 'Hard', description: 'Advanced techniques needed' }
];

const emptyRecipe = () => ({
  name: '',
  description: '',
  category: 'main',
  servings: 4,
  prep_time: 0,
  cook_time: 0,
  instructions: '',
  tags: [],
  ingredients: [],
  difficulty: 'medium',
  cuisine_type: '',
  recipe_type: 'dinner',
  image_url: '',
  source_url: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0
});

export default function RecipeModal({ recipe, onSave, onCancel, categories }) {
  const [formData, setFormData] = useState(() => recipe || emptyRecipe());
  const [currentTab, setCurrentTab] = useState('basic');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Initialize form data when recipe prop changes
  useEffect(() => {
    if (recipe) {
      setFormData({
        ...emptyRecipe(),
        ...recipe,
        tags: recipe.tags || []
      });
    } else {
      setFormData(emptyRecipe());
    }
    setErrors({});
  }, [recipe]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const addIngredient = () => {
    setFormData(prev => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { name: '', quantity: 1, unit: '', category: 'other' }
      ]
    }));
  };

  const updateIngredient = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      )
    }));
  };

  const removeIngredient = (index) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Recipe name is required';
    }

    if (formData.servings < 1) {
      newErrors.servings = 'Servings must be at least 1';
    }

    if (formData.prep_time < 0) {
      newErrors.prep_time = 'Prep time cannot be negative';
    }

    if (formData.cook_time < 0) {
      newErrors.cook_time = 'Cook time cannot be negative';
    }

    if (formData.ingredients.some(ing => !ing.name.trim())) {
      newErrors.ingredients = 'All ingredients must have a name';
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
      await onSave(formData);
    } catch (error) {
      console.error('Failed to save recipe:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTagsChange = (e) => {
    const tags = e.target.value
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    updateField('tags', tags);
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: '📝' },
    { id: 'ingredients', label: 'Ingredients', icon: '🧾' },
    { id: 'instructions', label: 'Instructions', icon: '👩‍🍳' },
    { id: 'nutrition', label: 'Nutrition', icon: '🥗' },
  ];

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {recipe ? 'Edit Recipe' : 'Create New Recipe'}
          </h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-primary)',
          marginBottom: 'var(--spacing-xl)'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={currentTab === tab.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{
                borderRadius: 0,
                borderBottom: currentTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ minHeight: '400px' }}>
          {/* Basic Info Tab */}
          {currentTab === 'basic' && (
            <div className="grid grid-cols-1" style={{ gap: 'var(--spacing-lg)' }}>
              <div>
                <label className="label label-required">Recipe Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={`input ${errors.name ? 'input-error' : ''}`}
                  placeholder="Enter recipe name"
                />
                {errors.name && <div className="error-text">{errors.name}</div>}
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="input textarea"
                  placeholder="Brief description of the recipe"
                  rows="3"
                />
              </div>

              <div className="grid grid-cols-2" style={{ gap: 'var(--spacing-lg)' }}>
                <div>
                  <label className="label">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value)}
                    className="input select"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Difficulty</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => updateField('difficulty', e.target.value)}
                    className="input select"
                  >
                    {DIFFICULTY_LEVELS.map(level => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3" style={{ gap: 'var(--spacing-lg)' }}>
                <div>
                  <label className="label">Servings</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.servings}
                    onChange={(e) => updateField('servings', parseInt(e.target.value) || 1)}
                    className={`input ${errors.servings ? 'input-error' : ''}`}
                  />
                  {errors.servings && <div className="error-text">{errors.servings}</div>}
                </div>

                <div>
                  <label className="label">Prep Time (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.prep_time}
                    onChange={(e) => updateField('prep_time', parseInt(e.target.value) || 0)}
                    className={`input ${errors.prep_time ? 'input-error' : ''}`}
                  />
                  {errors.prep_time && <div className="error-text">{errors.prep_time}</div>}
                </div>

                <div>
                  <label className="label">Cook Time (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.cook_time}
                    onChange={(e) => updateField('cook_time', parseInt(e.target.value) || 0)}
                    className={`input ${errors.cook_time ? 'input-error' : ''}`}
                  />
                  {errors.cook_time && <div className="error-text">{errors.cook_time}</div>}
                </div>
              </div>

              <div className="grid grid-cols-2" style={{ gap: 'var(--spacing-lg)' }}>
                <div>
                  <label className="label">Cuisine Type</label>
                  <input
                    type="text"
                    value={formData.cuisine_type}
                    onChange={(e) => updateField('cuisine_type', e.target.value)}
                    className="input"
                    placeholder="e.g., Italian, Mexican, Asian"
                  />
                </div>

                <div>
                  <label className="label">Meal Type</label>
                  <select
                    value={formData.recipe_type}
                    onChange={(e) => updateField('recipe_type', e.target.value)}
                    className="input select"
                  >
                    <option value="breakfast">🌅 Breakfast</option>
                    <option value="lunch">🥗 Lunch</option>
                    <option value="dinner">🍽️ Dinner</option>
                    <option value="snack">🍿 Snack</option>
                    <option value="dessert">🍰 Dessert</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags.join(', ')}
                  onChange={handleTagsChange}
                  className="input"
                  placeholder="e.g., vegetarian, quick, comfort food"
                />
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginTop: 'var(--spacing-xs)' }}>
                  Separate tags with commas
                </div>
              </div>

              <div className="grid grid-cols-2" style={{ gap: 'var(--spacing-lg)' }}>
                <div>
                  <label className="label">Image URL</label>
                  <input
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => updateField('image_url', e.target.value)}
                    className="input"
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <label className="label">Source URL</label>
                  <input
                    type="url"
                    value={formData.source_url}
                    onChange={(e) => updateField('source_url', e.target.value)}
                    className="input"
                    placeholder="Original recipe source"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Ingredients Tab */}
          {currentTab === 'ingredients' && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-lg)'
              }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Ingredients</h3>
                <button onClick={addIngredient} className="btn btn-primary btn-sm">
                  + Add Ingredient
                </button>
              </div>

              {errors.ingredients && <div className="error-text mb-lg">{errors.ingredients}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {formData.ingredients.map((ingredient, index) => (
                  <div key={index} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1.5fr auto',
                    gap: 'var(--spacing-sm)',
                    alignItems: 'end',
                    padding: 'var(--spacing-md)',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div>
                      <label className="label">Name</label>
                      <input
                        type="text"
                        value={ingredient.name}
                        onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                        className="input input-sm"
                        placeholder="Ingredient name"
                      />
                    </div>

                    <div>
                      <label className="label">Quantity</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ingredient.quantity}
                        onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
                        className="input input-sm"
                      />
                    </div>

                    <div>
                      <label className="label">Unit</label>
                      <input
                        type="text"
                        value={ingredient.unit}
                        onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                        className="input input-sm"
                        placeholder="cup, tsp, etc."
                      />
                    </div>

                    <div>
                      <label className="label">Category</label>
                      <select
                        value={ingredient.category}
                        onChange={(e) => updateIngredient(index, 'category', e.target.value)}
                        className="input select input-sm"
                      >
                        {INGREDIENT_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeIngredient(index)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--error)' }}
                      title="Remove ingredient"
                    >
                      🗑️
                    </button>
                  </div>
                ))}

                {formData.ingredients.length === 0 && (
                  <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
                    <div className="empty-state-icon">🧾</div>
                    <h4 className="empty-state-title">No ingredients yet</h4>
                    <p className="empty-state-description">
                      Add ingredients to help with meal planning and shopping lists
                    </p>
                    <button onClick={addIngredient} className="btn btn-primary">
                      Add First Ingredient
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Instructions Tab */}
          {currentTab === 'instructions' && (
            <div>
              <label className="label">Cooking Instructions</label>
              <textarea
                value={formData.instructions}
                onChange={(e) => updateField('instructions', e.target.value)}
                className="input textarea"
                style={{ minHeight: '300px' }}
                placeholder="Step-by-step cooking instructions..."
              />
              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginTop: 'var(--spacing-xs)' }}>
                Write clear, step-by-step instructions. Each step should be on a new line or separated by numbers.
              </div>
            </div>
          )}

          {/* Nutrition Tab */}
          {currentTab === 'nutrition' && (
            <div>
              <h3 style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--text-primary)' }}>
                Nutritional Information (per serving)
              </h3>
              
              <div className="grid grid-cols-2" style={{ gap: 'var(--spacing-lg)' }}>
                <div>
                  <label className="label">Calories</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.calories}
                    onChange={(e) => updateField('calories', parseInt(e.target.value) || 0)}
                    className="input"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="label">Protein (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.protein}
                    onChange={(e) => updateField('protein', parseFloat(e.target.value) || 0)}
                    className="input"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="label">Carbohydrates (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.carbs}
                    onChange={(e) => updateField('carbs', parseFloat(e.target.value) || 0)}
                    className="input"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="label">Fat (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.fat}
                    onChange={(e) => updateField('fat', parseFloat(e.target.value) || 0)}
                    className="input"
                    placeholder="0"
                  />
                </div>
              </div>

              <div style={{ 
                marginTop: 'var(--spacing-xl)',
                padding: 'var(--spacing-lg)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-muted)'
              }}>
                💡 <strong>Tip:</strong> Nutritional information is optional but helpful for meal planning and dietary tracking.
                You can use nutrition calculators or food databases to get accurate values.
              </div>
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
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading && <LoadingSpinner />}
            {loading ? 'Saving...' : (recipe ? 'Update Recipe' : 'Create Recipe')}
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