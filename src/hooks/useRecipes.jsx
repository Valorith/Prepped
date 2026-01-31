import { useState, useEffect } from 'react';
import { recipesApi, withLoading } from '../utils/api.js';

export function useRecipes() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await recipesApi.getAll();
      setRecipes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createRecipe = async (recipe) => {
    const created = await withLoading(
      () => recipesApi.create(recipe),
      'create-recipe',
      { successMessage: 'Recipe created successfully!' }
    );
    setRecipes(prev => [...prev, created]);
    return created;
  };

  const updateRecipe = async (id, recipe) => {
    const updated = await withLoading(
      () => recipesApi.update(id, recipe),
      'update-recipe',
      { successMessage: 'Recipe updated successfully!' }
    );
    setRecipes(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  };

  const deleteRecipe = async (id) => {
    await withLoading(
      () => recipesApi.delete(id),
      'delete-recipe',
      { successMessage: 'Recipe deleted successfully!' }
    );
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const toggleFavorite = async (id) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    
    const updated = await updateRecipe(id, {
      ...recipe,
      is_favorite: !recipe.is_favorite
    });
    return updated;
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  return {
    recipes,
    loading,
    error,
    refetch: loadRecipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    toggleFavorite,
  };
}

export function useRecipeSearch(recipes, searchTerm = '', filters = {}) {
  const [filteredRecipes, setFilteredRecipes] = useState(recipes);

  useEffect(() => {
    let filtered = recipes;

    // Text search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(recipe =>
        recipe.name.toLowerCase().includes(term) ||
        recipe.description?.toLowerCase().includes(term) ||
        recipe.tags?.some(tag => tag.toLowerCase().includes(term)) ||
        recipe.ingredients?.some(ing => ing.name.toLowerCase().includes(term))
      );
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter(recipe => recipe.category === filters.category);
    }

    // Tags filter
    if (filters.tags?.length) {
      filtered = filtered.filter(recipe =>
        filters.tags.some(tag => recipe.tags?.includes(tag))
      );
    }

    // Favorites filter
    if (filters.favorites) {
      filtered = filtered.filter(recipe => recipe.is_favorite);
    }

    // Time filters
    if (filters.maxTime) {
      filtered = filtered.filter(recipe =>
        (recipe.prep_time + recipe.cook_time) <= filters.maxTime
      );
    }

    // Servings filter
    if (filters.servings) {
      filtered = filtered.filter(recipe => recipe.servings >= filters.servings);
    }

    setFilteredRecipes(filtered);
  }, [recipes, searchTerm, filters]);

  return filteredRecipes;
}