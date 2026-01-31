import React, { useState } from 'react';

const TIME_FILTERS = [
  { value: '', label: 'Any Time' },
  { value: 15, label: '15 min or less' },
  { value: 30, label: '30 min or less' },
  { value: 60, label: '1 hour or less' },
  { value: 120, label: '2 hours or less' },
];

const DIFFICULTY_FILTERS = [
  { value: '', label: 'Any Difficulty' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export default function RecipeFilters({ filters, onFiltersChange, categories }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = (key, value) => {
    const newFilters = { ...filters };
    if (value === '' || value === false || value === null) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    onFiltersChange({});
    setShowAdvanced(false);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-md)'
    }}>
      {/* Quick Filters */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-sm)',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Favorites Toggle */}
        <button
          onClick={() => updateFilter('favorites', !filters.favorites)}
          className={filters.favorites ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
          title="Show favorites only"
        >
          ❤️ Favorites
        </button>

        {/* Category Filter */}
        <select
          value={filters.category || ''}
          onChange={(e) => updateFilter('category', e.target.value)}
          className="input select input-sm"
          style={{ width: 'auto', minWidth: '140px' }}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>
              {cat.icon} {cat.label}
            </option>
          ))}
        </select>

        {/* Difficulty Filter */}
        <select
          value={filters.difficulty || ''}
          onChange={(e) => updateFilter('difficulty', e.target.value)}
          className="input select input-sm"
          style={{ width: 'auto', minWidth: '120px' }}
        >
          {DIFFICULTY_FILTERS.map(diff => (
            <option key={diff.value} value={diff.value}>
              {diff.label}
            </option>
          ))}
        </select>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={showAdvanced ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
        >
          🔧 {showAdvanced ? 'Hide' : 'More'} Filters
        </button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--error)' }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--spacing-md)',
          padding: 'var(--spacing-lg)',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-primary)'
        }}>
          {/* Max Cooking Time */}
          <div>
            <label className="label">Max Cooking Time</label>
            <select
              value={filters.maxTime || ''}
              onChange={(e) => updateFilter('maxTime', e.target.value ? parseInt(e.target.value) : '')}
              className="input select input-sm"
            >
              {TIME_FILTERS.map(time => (
                <option key={time.value} value={time.value}>
                  {time.label}
                </option>
              ))}
            </select>
          </div>

          {/* Min Servings */}
          <div>
            <label className="label">Min Servings</label>
            <input
              type="number"
              min="1"
              max="20"
              value={filters.servings || ''}
              onChange={(e) => updateFilter('servings', e.target.value ? parseInt(e.target.value) : '')}
              placeholder="Any amount"
              className="input input-sm"
            />
          </div>

          {/* Min Rating */}
          <div>
            <label className="label">Min Rating</label>
            <select
              value={filters.minRating || ''}
              onChange={(e) => updateFilter('minRating', e.target.value ? parseFloat(e.target.value) : '')}
              className="input select input-sm"
            >
              <option value="">Any Rating</option>
              <option value="4">4+ Stars</option>
              <option value="3">3+ Stars</option>
              <option value="2">2+ Stars</option>
              <option value="1">1+ Stars</option>
            </select>
          </div>

          {/* Has Nutritional Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <input
              type="checkbox"
              id="has-nutrition"
              checked={filters.hasNutrition || false}
              onChange={(e) => updateFilter('hasNutrition', e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            <label htmlFor="has-nutrition" className="label" style={{ margin: 0, cursor: 'pointer' }}>
              Has Nutritional Info
            </label>
          </div>

          {/* Recipe Type */}
          <div>
            <label className="label">Meal Type</label>
            <select
              value={filters.recipeType || ''}
              onChange={(e) => updateFilter('recipeType', e.target.value)}
              className="input select input-sm"
            >
              <option value="">Any Meal</option>
              <option value="breakfast">🌅 Breakfast</option>
              <option value="lunch">🥗 Lunch</option>
              <option value="dinner">🍽️ Dinner</option>
              <option value="snack">🍿 Snack</option>
              <option value="dessert">🍰 Dessert</option>
            </select>
          </div>

          {/* Cuisine Type */}
          <div>
            <label className="label">Cuisine</label>
            <input
              type="text"
              value={filters.cuisine || ''}
              onChange={(e) => updateFilter('cuisine', e.target.value)}
              placeholder="e.g., Italian, Mexican"
              className="input input-sm"
            />
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-xs)',
          alignItems: 'center'
        }}>
          <span className="text-sm text-muted">Active filters:</span>
          
          {filters.favorites && (
            <span className="tag tag-secondary">❤️ Favorites</span>
          )}
          
          {filters.category && (
            <span className="tag tag-primary">
              {categories.find(c => c.value === filters.category)?.label || filters.category}
            </span>
          )}
          
          {filters.difficulty && (
            <span className="tag tag-primary">
              {filters.difficulty} difficulty
            </span>
          )}
          
          {filters.maxTime && (
            <span className="tag tag-primary">
              ≤ {filters.maxTime}min
            </span>
          )}
          
          {filters.servings && (
            <span className="tag tag-primary">
              {filters.servings}+ servings
            </span>
          )}
          
          {filters.minRating && (
            <span className="tag tag-primary">
              {filters.minRating}+ ⭐
            </span>
          )}
          
          {filters.recipeType && (
            <span className="tag tag-primary">
              {filters.recipeType}
            </span>
          )}
          
          {filters.cuisine && (
            <span className="tag tag-primary">
              {filters.cuisine} cuisine
            </span>
          )}
        </div>
      )}
    </div>
  );
}