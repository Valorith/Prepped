import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { runMigrations } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Serve static frontend in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Run database migrations
runMigrations();

// Database setup
const db = new Database(join(__dirname, 'meal-planner.db'), { wal: true });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Enhanced error handling middleware
const handleError = (error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Input validation middleware
const validateRecipe = (req, res, next) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Recipe name is required' });
  }
  if (name.length > 200) {
    return res.status(400).json({ error: 'Recipe name must be less than 200 characters' });
  }
  next();
};

// ============ ENHANCED RECIPES ============

app.get('/api/recipes', (req, res) => {
  try {
    const { 
      search, 
      category, 
      cuisine, 
      difficulty, 
      max_time, 
      min_rating,
      favorites_only,
      recipe_type,
      sort = 'name',
      order = 'asc'
    } = req.query;
    
    let query = 'SELECT * FROM recipes WHERE 1=1';
    const params = [];
    
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ? OR instructions LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (category) {
      query += ' AND tags LIKE ?';
      params.push(`%${category}%`);
    }
    
    if (cuisine) {
      query += ' AND cuisine_type = ?';
      params.push(cuisine);
    }
    
    if (difficulty) {
      query += ' AND difficulty = ?';
      params.push(difficulty);
    }
    
    if (max_time) {
      query += ' AND (prep_time + cook_time) <= ?';
      params.push(parseInt(max_time));
    }
    
    if (min_rating) {
      query += ' AND rating >= ?';
      params.push(parseFloat(min_rating));
    }
    
    if (favorites_only === 'true') {
      query += ' AND is_favorite = 1';
    }
    
    if (recipe_type) {
      query += ' AND recipe_type = ?';
      params.push(recipe_type);
    }
    
    // Sorting
    const validSorts = ['name', 'created_at', 'updated_at', 'rating', 'prep_time', 'cook_time'];
    const validOrders = ['asc', 'desc'];
    
    const sortField = validSorts.includes(sort) ? sort : 'name';
    const sortOrder = validOrders.includes(order.toLowerCase()) ? order.toUpperCase() : 'ASC';
    
    query += ` ORDER BY ${sortField} ${sortOrder}`;
    
    const recipes = db.prepare(query).all(...params);
    
    for (const r of recipes) {
      r.tags = JSON.parse(r.tags || '[]');
      r.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY name').all(r.id);
      r.total_time = (r.prep_time || 0) + (r.cook_time || 0);
    }
    
    res.json(recipes);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.get('/api/recipes/:id', (req, res) => {
  try {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    
    recipe.tags = JSON.parse(recipe.tags || '[]');
    recipe.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY name').all(recipe.id);
    recipe.total_time = (recipe.prep_time || 0) + (recipe.cook_time || 0);
    
    // Get ratings
    const ratings = db.prepare('SELECT * FROM recipe_ratings WHERE recipe_id = ? ORDER BY created_at DESC').all(recipe.id);
    recipe.ratings = ratings;
    
    res.json(recipe);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/recipes', validateRecipe, (req, res) => {
  try {
    const id = uuidv4();
    const { 
      name, description, servings, prep_time, cook_time, instructions, tags, ingredients,
      calories, protein, carbs, fat, difficulty, cuisine_type, recipe_type, source_url, image_url
    } = req.body;
    
    db.prepare(`INSERT INTO recipes (
      id, name, description, servings, prep_time, cook_time, instructions, tags,
      calories, protein, carbs, fat, difficulty, cuisine_type, recipe_type, source_url, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, name, description || '', servings || 4, prep_time || 0, cook_time || 0, 
      instructions || '', JSON.stringify(tags || []), calories || 0, protein || 0, 
      carbs || 0, fat || 0, difficulty || 'medium', cuisine_type || '', recipe_type || 'dinner',
      source_url || '', image_url || ''
    );
    
    if (ingredients?.length) {
      const stmt = db.prepare('INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)');
      for (const ing of ingredients) {
        if (ing.name && ing.name.trim()) {
          stmt.run(uuidv4(), id, ing.name.trim(), ing.quantity || 1, ing.unit || '', ing.category || 'other');
        }
      }
    }
    
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    recipe.tags = JSON.parse(recipe.tags || '[]');
    recipe.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(id);
    
    res.status(201).json(recipe);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.put('/api/recipes/:id', validateRecipe, (req, res) => {
  try {
    const { 
      name, description, servings, prep_time, cook_time, instructions, tags, ingredients,
      calories, protein, carbs, fat, difficulty, cuisine_type, recipe_type, source_url, image_url
    } = req.body;
    
    const result = db.prepare(`UPDATE recipes SET 
      name=?, description=?, servings=?, prep_time=?, cook_time=?, instructions=?, tags=?,
      calories=?, protein=?, carbs=?, fat=?, difficulty=?, cuisine_type=?, recipe_type=?,
      source_url=?, image_url=?, updated_at=datetime('now')
      WHERE id=?`).run(
      name, description || '', servings || 4, prep_time || 0, cook_time || 0, 
      instructions || '', JSON.stringify(tags || []), calories || 0, protein || 0, 
      carbs || 0, fat || 0, difficulty || 'medium', cuisine_type || '', recipe_type || 'dinner',
      source_url || '', image_url || '', req.params.id
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    // Replace ingredients
    db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(req.params.id);
    if (ingredients?.length) {
      const stmt = db.prepare('INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)');
      for (const ing of ingredients) {
        if (ing.name && ing.name.trim()) {
          stmt.run(uuidv4(), req.params.id, ing.name.trim(), ing.quantity || 1, ing.unit || '', ing.category || 'other');
        }
      }
    }
    
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    recipe.tags = JSON.parse(recipe.tags || '[]');
    recipe.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(req.params.id);
    
    res.json(recipe);
  } catch (error) {
    handleError(error, req, res);
  }
});

// Scale recipe serving size
app.post('/api/recipes/:id/scale', (req, res) => {
  try {
    const { servings } = req.body;
    if (!servings || servings <= 0) {
      return res.status(400).json({ error: 'Valid serving size required' });
    }
    
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    
    const ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(req.params.id);
    const scaleFactor = servings / recipe.servings;
    
    const scaledIngredients = ingredients.map(ing => ({
      ...ing,
      quantity: Math.round((ing.quantity * scaleFactor) * 100) / 100
    }));
    
    res.json({
      ...recipe,
      servings,
      tags: JSON.parse(recipe.tags || '[]'),
      ingredients: scaledIngredients,
      scale_factor: scaleFactor
    });
  } catch (error) {
    handleError(error, req, res);
  }
});

// Toggle favorite
app.post('/api/recipes/:id/favorite', (req, res) => {
  try {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    
    const newFavoriteStatus = recipe.is_favorite ? 0 : 1;
    db.prepare('UPDATE recipes SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newFavoriteStatus, req.params.id);
    
    res.json({ is_favorite: !!newFavoriteStatus });
  } catch (error) {
    handleError(error, req, res);
  }
});

// Add rating
app.post('/api/recipes/:id/rate', (req, res) => {
  try {
    const { rating, comment } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    
    // Add new rating
    const ratingId = uuidv4();
    db.prepare('INSERT INTO recipe_ratings (id, recipe_id, rating, comment) VALUES (?, ?, ?, ?)')
      .run(ratingId, req.params.id, rating, comment || '');
    
    // Update recipe average rating
    const ratings = db.prepare('SELECT rating FROM recipe_ratings WHERE recipe_id = ?').all(req.params.id);
    const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    
    db.prepare('UPDATE recipes SET rating = ?, rating_count = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(Math.round(avgRating * 10) / 10, ratings.length, req.params.id);
    
    res.status(201).json({ rating: Math.round(avgRating * 10) / 10, rating_count: ratings.length });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/recipes/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ ENHANCED MEAL PLAN ============

app.get('/api/meals', (req, res) => {
  try {
    const { start, end, recipe_id } = req.query;
    let meals;
    
    if (start && end) {
      meals = db.prepare(`
        SELECT mp.*, r.name as recipe_name, r.prep_time, r.cook_time, r.servings, r.difficulty
        FROM meal_plan mp 
        LEFT JOIN recipes r ON mp.recipe_id = r.id 
        WHERE mp.date >= ? AND mp.date <= ? 
        ORDER BY mp.date, 
          CASE mp.meal_type 
            WHEN 'breakfast' THEN 1 
            WHEN 'lunch' THEN 2 
            WHEN 'dinner' THEN 3 
            WHEN 'snack' THEN 4 
            ELSE 5 
          END
      `).all(start, end);
    } else if (recipe_id) {
      meals = db.prepare(`
        SELECT mp.*, r.name as recipe_name 
        FROM meal_plan mp 
        LEFT JOIN recipes r ON mp.recipe_id = r.id 
        WHERE mp.recipe_id = ? 
        ORDER BY mp.date DESC 
        LIMIT 20
      `).all(recipe_id);
    } else {
      meals = db.prepare(`
        SELECT mp.*, r.name as recipe_name 
        FROM meal_plan mp 
        LEFT JOIN recipes r ON mp.recipe_id = r.id 
        ORDER BY mp.date DESC, mp.meal_type 
        LIMIT 100
      `).all();
    }
    
    res.json(meals);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/meals', (req, res) => {
  try {
    const id = uuidv4();
    const { recipe_id, date, meal_type, notes, custom_name } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    if (!recipe_id && !custom_name) {
      return res.status(400).json({ error: 'Either recipe_id or custom_name is required' });
    }
    
    db.prepare('INSERT INTO meal_plan (id, recipe_id, date, meal_type, notes, custom_name) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, recipe_id || null, date, meal_type || 'dinner', notes || '', custom_name || '');
    
    const meal = db.prepare(`
      SELECT mp.*, r.name as recipe_name, r.prep_time, r.cook_time, r.servings 
      FROM meal_plan mp 
      LEFT JOIN recipes r ON mp.recipe_id = r.id 
      WHERE mp.id = ?
    `).get(id);
    
    res.status(201).json(meal);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.put('/api/meals/:id', (req, res) => {
  try {
    const { recipe_id, date, meal_type, notes, custom_name } = req.body;
    
    const result = db.prepare('UPDATE meal_plan SET recipe_id=?, date=?, meal_type=?, notes=?, custom_name=? WHERE id=?')
      .run(recipe_id || null, date, meal_type || 'dinner', notes || '', custom_name || '', req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    
    const meal = db.prepare(`
      SELECT mp.*, r.name as recipe_name, r.prep_time, r.cook_time, r.servings 
      FROM meal_plan mp 
      LEFT JOIN recipes r ON mp.recipe_id = r.id 
      WHERE mp.id = ?
    `).get(req.params.id);
    
    res.json(meal);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/meals/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM meal_plan WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ MEAL TEMPLATES ============

app.get('/api/meal-templates', (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM meal_templates ORDER BY name').all();
    for (const template of templates) {
      template.template_data = JSON.parse(template.template_data);
    }
    res.json(templates);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/meal-templates', (req, res) => {
  try {
    const { name, description, start_date, end_date } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    // Get meals for the date range
    const meals = db.prepare(`
      SELECT recipe_id, date, meal_type, notes, custom_name 
      FROM meal_plan 
      WHERE date >= ? AND date <= ?
      ORDER BY date, meal_type
    `).all(start_date, end_date);
    
    const templateId = uuidv4();
    db.prepare('INSERT INTO meal_templates (id, name, description, template_data) VALUES (?, ?, ?, ?)')
      .run(templateId, name, description || '', JSON.stringify(meals));
    
    const template = db.prepare('SELECT * FROM meal_templates WHERE id = ?').get(templateId);
    template.template_data = JSON.parse(template.template_data);
    
    res.status(201).json(template);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/meal-templates/:id/apply', (req, res) => {
  try {
    const { start_date, clear_existing } = req.body;
    
    if (!start_date) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    
    const template = db.prepare('SELECT * FROM meal_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const templateData = JSON.parse(template.template_data);
    if (!Array.isArray(templateData) || templateData.length === 0) {
      return res.status(400).json({ error: 'Invalid template data' });
    }
    
    // Calculate date offset
    const templateStartDate = new Date(Math.min(...templateData.map(m => new Date(m.date))));
    const newStartDate = new Date(start_date);
    const daysDiff = Math.floor((newStartDate - templateStartDate) / (24 * 60 * 60 * 1000));
    
    if (clear_existing) {
      const templateEndDate = new Date(Math.max(...templateData.map(m => new Date(m.date))));
      const newEndDate = new Date(templateEndDate.getTime() + daysDiff * 24 * 60 * 60 * 1000);
      
      db.prepare('DELETE FROM meal_plan WHERE date >= ? AND date <= ?')
        .run(newStartDate.toISOString().split('T')[0], newEndDate.toISOString().split('T')[0]);
    }
    
    // Apply template
    const stmt = db.prepare('INSERT INTO meal_plan (id, recipe_id, date, meal_type, notes, custom_name) VALUES (?, ?, ?, ?, ?, ?)');
    const addedMeals = [];
    
    for (const meal of templateData) {
      const originalDate = new Date(meal.date);
      const newDate = new Date(originalDate.getTime() + daysDiff * 24 * 60 * 60 * 1000);
      const newMealId = uuidv4();
      
      stmt.run(
        newMealId, 
        meal.recipe_id, 
        newDate.toISOString().split('T')[0],
        meal.meal_type,
        meal.notes || '',
        meal.custom_name || ''
      );
      
      addedMeals.push(newMealId);
    }
    
    res.json({ 
      ok: true, 
      added_meals: addedMeals.length,
      message: `Applied template "${template.name}" starting from ${start_date}`
    });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/meal-templates/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM meal_templates WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ ENHANCED SHOPPING LIST ============

app.get('/api/shopping', (req, res) => {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon, ga.sort_order
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      ${category ? 'WHERE sl.aisle_id = ?' : ''}
      ORDER BY ga.sort_order ASC, sl.checked ASC, sl.name ASC
    `;
    
    const items = category 
      ? db.prepare(query).all(category)
      : db.prepare(query).all();
    
    res.json(items);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.get('/api/grocery-aisles', (req, res) => {
  try {
    const aisles = db.prepare('SELECT * FROM grocery_aisles ORDER BY sort_order').all();
    res.json(aisles);
  } catch (error) {
    handleError(error, req, res);
  }
});

// Generate shopping list from meal plan date range
app.post('/api/shopping/generate', (req, res) => {
  try {
    const { start, end, clear_existing, include_servings } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    
    if (clear_existing) {
      db.prepare("DELETE FROM shopping_list WHERE week_of = ?").run(start);
    }
    
    // Get all meals in range that have recipes
    const meals = db.prepare(`
      SELECT mp.recipe_id, r.servings, COUNT(*) as meal_count
      FROM meal_plan mp 
      JOIN recipes r ON mp.recipe_id = r.id
      WHERE mp.date >= ? AND mp.date <= ? AND mp.recipe_id IS NOT NULL
      GROUP BY mp.recipe_id, r.servings
    `).all(start, end);
    
    if (!meals.length) return res.json([]);
    
    // Aggregate ingredients
    const ingredientMap = new Map();
    for (const meal of meals) {
      const ings = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(meal.recipe_id);
      const servingMultiplier = include_servings ? meal.meal_count : meal.meal_count;
      
      for (const ing of ings) {
        const key = `${ing.name.toLowerCase()}|${ing.unit}|${ing.category}`;
        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key);
          existing.quantity += ing.quantity * servingMultiplier;
        } else {
          ingredientMap.set(key, { 
            name: ing.name, 
            quantity: ing.quantity * servingMultiplier, 
            unit: ing.unit, 
            category: ing.category,
            aisle_id: ing.category // Map ingredient category to aisle
          });
        }
      }
    }
    
    // Insert into shopping list
    const stmt = db.prepare('INSERT INTO shopping_list (id, name, quantity, unit, category, aisle_id, week_of) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const addedItems = [];
    
    for (const [, item] of ingredientMap) {
      const id = uuidv4();
      stmt.run(id, item.name, Math.round(item.quantity * 100) / 100, item.unit, item.category, item.aisle_id, start);
      addedItems.push(id);
    }
    
    const items = db.prepare(`
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon 
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      WHERE sl.week_of = ? 
      ORDER BY ga.sort_order, sl.name
    `).all(start);
    
    res.json({ items, added_count: addedItems.length });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/shopping', (req, res) => {
  try {
    const id = uuidv4();
    const { name, quantity, unit, category, aisle_id } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    db.prepare('INSERT INTO shopping_list (id, name, quantity, unit, category, aisle_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name.trim(), quantity || 1, unit || '', category || 'other', aisle_id || 'other');
    
    const item = db.prepare(`
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon 
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      WHERE sl.id = ?
    `).get(id);
    
    res.status(201).json(item);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.patch('/api/shopping/:id', (req, res) => {
  try {
    const { checked, aisle_id } = req.body;
    
    let query = '';
    let params = [];
    
    if (checked !== undefined) {
      query = 'UPDATE shopping_list SET checked = ? WHERE id = ?';
      params = [checked ? 1 : 0, req.params.id];
    } else if (aisle_id !== undefined) {
      query = 'UPDATE shopping_list SET aisle_id = ? WHERE id = ?';
      params = [aisle_id, req.params.id];
    } else {
      return res.status(400).json({ error: 'No valid field to update' });
    }
    
    const result = db.prepare(query).run(...params);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = db.prepare(`
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon 
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      WHERE sl.id = ?
    `).get(req.params.id);
    
    res.json(item);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/shopping/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM shopping_list WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/shopping', (req, res) => {
  try {
    const { checked_only } = req.query;
    
    if (checked_only === 'true') {
      db.prepare('DELETE FROM shopping_list WHERE checked = 1').run();
    } else {
      db.prepare('DELETE FROM shopping_list').run();
    }
    
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ ANALYTICS & STATS ============

app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      total_recipes: db.prepare('SELECT COUNT(*) as count FROM recipes').get().count,
      favorite_recipes: db.prepare('SELECT COUNT(*) as count FROM recipes WHERE is_favorite = 1').get().count,
      total_meals_planned: db.prepare('SELECT COUNT(*) as count FROM meal_plan').get().count,
      avg_recipe_rating: db.prepare('SELECT AVG(rating) as avg FROM recipes WHERE rating > 0').get().avg || 0,
      shopping_list_items: db.prepare('SELECT COUNT(*) as count FROM shopping_list').get().count,
      popular_recipes: db.prepare(`
        SELECT r.id, r.name, r.rating, COUNT(mp.id) as usage_count
        FROM recipes r
        LEFT JOIN meal_plan mp ON r.id = mp.recipe_id
        GROUP BY r.id, r.name, r.rating
        ORDER BY usage_count DESC, r.rating DESC
        LIMIT 10
      `).all(),
      recent_activity: db.prepare(`
        SELECT 'meal' as type, date, custom_name as name, meal_type as extra
        FROM meal_plan 
        WHERE date >= date('now', '-7 days')
        UNION ALL
        SELECT 'recipe' as type, date(created_at) as date, name, cuisine_type as extra
        FROM recipes 
        WHERE created_at >= datetime('now', '-7 days')
        ORDER BY date DESC
        LIMIT 20
      `).all()
    };
    
    stats.avg_recipe_rating = Math.round(stats.avg_recipe_rating * 10) / 10;
    
    res.json(stats);
  } catch (error) {
    handleError(error, req, res);
  }
});

// Error handling middleware
app.use(handleError);

// SPA fallback
app.get('*', (req, res) => {
  if (existsSync(join(distPath, 'index.html'))) {
    res.sendFile(join(distPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Enhanced Meal Planner API running on port ${PORT}`);
});