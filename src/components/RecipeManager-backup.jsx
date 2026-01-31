import React, { useState, useEffect } from 'react';
import { useRecipes, useRecipeSearch } from '../hooks/useRecipes.jsx';
import { useLoading, LoadingSpinner } from '../hooks/useLoading.jsx';
import RecipeModal from './RecipeModal.jsx';
import RecipeCard from './RecipeCard.jsx';
import RecipeFilters from './RecipeFilters.jsx';

const RECIPE_CATEGORIES = [
  { value: 'appetizer', label: 'Appetizer', icon: '🥗' },
  { value: 'main', label: 'Main Course', icon: '🍽️' },
  { value: 'side', label: 'Side Dish', icon: '🥕' },
  { value: 'dessert', label: 'Dessert', icon: '🍰' },
  { value: 'beverage', label: 'Beverage', icon: '🥤' },
  { value: 'snack', label: 'Snack', icon: '🍿' },
];

export default function RecipeManager() {
  const { recipes, loading, error, createRecipe, updateRecipe, deleteRecipe, toggleFavorite } = useRecipes();
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isLoading } = useLoading();

  const filteredRecipes = useRecipeSearch(recipes, searchTerm, filters);

  const handleCreateRecipe = () => {
    setSelectedRecipe(null);
    setIsModalOpen(true);
  };

  const handleEditRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setIsModalOpen(true);
  };

  const handleSaveRecipe = async (recipeData) => {
    try {
      if (selectedRecipe) {
        await updateRecipe(selectedRecipe.id, recipeData);
      } else {
        await createRecipe(recipeData);
      }
      setIsModalOpen(false);
      setSelectedRecipe(null);
    } catch (error) {
      // Error handling is done in the hook
      console.error('Failed to save recipe:', error);
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (window.confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
      try {
        await deleteRecipe(id);
      } catch (error) {
        console.error('Failed to delete recipe:', error);
      }
    }
  };

  const handleToggleFavorite = async (id) => {
    try {
      await toggleFavorite(id);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const getStatsString = () => {
    const total = recipes.length;
    const filtered = filteredRecipes.length;
    const favorites = recipes.filter(r => r.is_favorite).length;
    
    if (searchTerm || Object.keys(filters).length > 0) {
      return `${filtered} of ${total} recipes`;
    }
    
    return `${total} recipe${total !== 1 ? 's' : ''} ${favorites > 0 ? `(${favorites} favorite${favorites !== 1 ? 's' : ''})` : ''}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="flex items-center gap-md">
          <LoadingSpinner size={24} />
          <span className="text-secondary">Loading recipes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-2xl)' }}>
        <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-lg)' }}>⚠️</div>
        <h3 className="text-lg" style={{ color: 'var(--error)', marginBottom: 'var(--spacing-sm)' }}>
          Failed to load recipes
        </h3>
        <p className="text-muted mb-lg">{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--spacing-2xl)',
        gap: 'var(--spacing-lg)',
        flexWrap: 'wrap'
      }}>
        <div>
          <h2 style={{
            fontSize: 'var(--font-3xl)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            marginBottom: 'var(--spacing-xs)'
          }}>
            Recipe Collection
          </h2>
          <p style={{
            color: 'var(--text-muted)',
            margin: 0,
            fontSize: 'var(--font-base)'
          }}>
            {getStatsString()}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-xs)'
          }}>
            <button
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              title="Grid View"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              title="List View"
            >
              ☰
            </button>
          </div>
          
          {/* Create Recipe Button */}
          <button
            onClick={handleCreateRecipe}
            className="btn btn-primary"
            disabled={isLoading}
          >
            <span>+</span>
            New Recipe
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card mb-xl">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'var(--spacing-lg)',
          alignItems: 'start'
        }}>
          {/* Search Bar */}
          <div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search recipes, ingredients, or tags..."
                className="input"
                style={{
                  paddingLeft: '2.5rem',
                  marginBottom: 0
                }}
              />
              <div style={{
                position: 'absolute',
                left: 'var(--spacing-md)',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none'
              }}>
                🔍
              </div>
            </div>
          </div>
          
          {/* Filters */}
          <RecipeFilters
            filters={filters}
            onFiltersChange={setFilters}
            categories={RECIPE_CATEGORIES}
          />
        </div>
      </div>

      {/* Results */}
      {filteredRecipes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            {searchTerm || Object.keys(filters).length > 0 ? '🔍' : '📝'}
          </div>
          <h3 className="empty-state-title">
            {searchTerm || Object.keys(filters).length > 0 ? 'No recipes found' : 'No recipes yet'}
          </h3>
          <p className="empty-state-description">
            {searchTerm || Object.keys(filters).length > 0
              ? 'Try adjusting your search terms or filters'
              : 'Start building your recipe collection by creating your first recipe'
            }
          </p>
          {!searchTerm && Object.keys(filters).length === 0 && (
            <button onClick={handleCreateRecipe} className="btn btn-primary">
              Create Your First Recipe
            </button>
          )}
        </div>
      ) : (
        <div
          className={viewMode === 'grid' ? 'grid grid-auto-fill' : ''}
          style={{
            gap: 'var(--spacing-lg)',
            ...(viewMode === 'list' && {
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-md)'
            })
          }}
        >
          {filteredRecipes.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              viewMode={viewMode}
              onEdit={() => handleEditRecipe(recipe)}
              onDelete={() => handleDeleteRecipe(recipe.id)}
              onToggleFavorite={() => handleToggleFavorite(recipe.id)}
            />
          ))}
        </div>
      )}

      {/* Recipe Modal */}
      {isModalOpen && (
        <RecipeModal
          recipe={selectedRecipe}
          onSave={handleSaveRecipe}
          onCancel={() => {
            setIsModalOpen(false);
            setSelectedRecipe(null);
          }}
          categories={RECIPE_CATEGORIES}
        />
      )}
    </div>
  );
}