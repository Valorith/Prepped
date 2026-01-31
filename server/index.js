import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { runMigrations } from './migrations.js';
import * as cheerio from 'cheerio';

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
await runMigrations();

// Database setup
let pool = null;
let db = null;

if (process.env.DATABASE_URL) {
  console.log('Using PostgreSQL database');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  console.log('No DATABASE_URL found, using SQLite fallback for development');
  db = new Database(join(__dirname, 'meal-planner.db'), { wal: true });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}

// Database query helper
async function query(sql, params = []) {
  if (pool) {
    // PostgreSQL: convert ? to $1, $2, etc.
    let pgSql = sql;
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
    
    const result = await pool.query(pgSql, params);
    return result.rows;
  } else {
    // SQLite fallback
    if (sql.includes('INSERT') || sql.includes('UPDATE') || sql.includes('DELETE')) {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    } else {
      // For SELECT queries — always return array
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    }
  }
}

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

app.get('/api/recipes', async (req, res) => {
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
    
    let sql = 'SELECT * FROM recipes WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1} OR tags ILIKE $${paramIndex + 2} OR instructions ILIKE $${paramIndex + 3})`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      paramIndex += 4;
    }
    
    if (category) {
      sql += ` AND tags ILIKE $${paramIndex}`;
      params.push(`%${category}%`);
      paramIndex++;
    }
    
    if (cuisine) {
      sql += ` AND cuisine_type = $${paramIndex}`;
      params.push(cuisine);
      paramIndex++;
    }
    
    if (difficulty) {
      sql += ` AND difficulty = $${paramIndex}`;
      params.push(difficulty);
      paramIndex++;
    }
    
    if (max_time) {
      sql += ` AND (prep_time + cook_time) <= $${paramIndex}`;
      params.push(parseInt(max_time));
      paramIndex++;
    }
    
    if (min_rating) {
      sql += ` AND rating >= $${paramIndex}`;
      params.push(parseFloat(min_rating));
      paramIndex++;
    }
    
    if (favorites_only === 'true') {
      sql += ` AND is_favorite = ${pool ? 'true' : '1'}`;
    }
    
    if (recipe_type) {
      sql += ` AND recipe_type = $${paramIndex}`;
      params.push(recipe_type);
      paramIndex++;
    }
    
    // Sorting
    const validSorts = ['name', 'created_at', 'updated_at', 'rating', 'prep_time', 'cook_time'];
    const validOrders = ['asc', 'desc'];
    
    const sortField = validSorts.includes(sort) ? sort : 'name';
    const sortOrder = validOrders.includes(order.toLowerCase()) ? order.toUpperCase() : 'ASC';
    
    sql += ` ORDER BY ${sortField} ${sortOrder}`;
    
    const recipes = await query(sql, params);
    
    for (const r of recipes) {
      r.tags = JSON.parse(r.tags || '[]');
      const ingredients = await query('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY name', [r.id]);
      r.ingredients = ingredients;
      r.total_time = (r.prep_time || 0) + (r.cook_time || 0);
    }
    
    res.json(recipes);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.get('/api/recipes/:id', async (req, res) => {
  try {
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipes.length) return res.status(404).json({ error: 'Recipe not found' });
    
    const recipe = recipes[0];
    recipe.tags = JSON.parse(recipe.tags || '[]');
    recipe.ingredients = await query('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY name', [recipe.id]);
    recipe.total_time = (recipe.prep_time || 0) + (recipe.cook_time || 0);
    
    // Get ratings
    const ratings = await query('SELECT * FROM recipe_ratings WHERE recipe_id = ? ORDER BY created_at DESC', [recipe.id]);
    recipe.ratings = ratings;
    
    res.json(recipe);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/recipes', validateRecipe, async (req, res) => {
  try {
    const id = uuidv4();
    const { 
      name, description, servings, prep_time, cook_time, instructions, tags, ingredients,
      calories, protein, carbs, fat, difficulty, cuisine_type, recipe_type, source_url, image_url, import_source
    } = req.body;
    
    await query(`INSERT INTO recipes (
      id, name, description, servings, prep_time, cook_time, instructions, tags,
      calories, protein, carbs, fat, difficulty, cuisine_type, recipe_type, source_url, image_url, import_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id, name, description || '', servings || 4, prep_time || 0, cook_time || 0, 
      instructions || '', JSON.stringify(tags || []), calories || 0, protein || 0, 
      carbs || 0, fat || 0, difficulty || 'medium', cuisine_type || '', recipe_type || 'dinner',
      source_url || '', image_url || '', import_source || ''
    ]);
    
    if (ingredients?.length) {
      for (const ing of ingredients) {
        if (ing.name && ing.name.trim()) {
          await query('INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)', [
            uuidv4(), id, ing.name.trim(), ing.quantity || 1, ing.unit || '', ing.category || 'other'
          ]);
        }
      }
    }
    
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [id]);
    const recipe = recipes[0];
    recipe.tags = JSON.parse(recipe.tags || '[]');
    recipe.ingredients = await query('SELECT * FROM ingredients WHERE recipe_id = ?', [id]);
    
    res.status(201).json(recipe);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.put('/api/recipes/:id', validateRecipe, async (req, res) => {
  try {
    const { 
      name, description, servings, prep_time, cook_time, instructions, tags, ingredients,
      calories, protein, carbs, fat, difficulty, cuisine_type, recipe_type, source_url, image_url
    } = req.body;
    
    const updateSql = pool 
      ? `UPDATE recipes SET 
          name=$1, description=$2, servings=$3, prep_time=$4, cook_time=$5, instructions=$6, tags=$7,
          calories=$8, protein=$9, carbs=$10, fat=$11, difficulty=$12, cuisine_type=$13, recipe_type=$14,
          source_url=$15, image_url=$16, updated_at=NOW()
          WHERE id=$17`
      : `UPDATE recipes SET 
          name=?, description=?, servings=?, prep_time=?, cook_time=?, instructions=?, tags=?,
          calories=?, protein=?, carbs=?, fat=?, difficulty=?, cuisine_type=?, recipe_type=?,
          source_url=?, image_url=?, updated_at=datetime('now')
          WHERE id=?`;
    
    const result = await query(updateSql, [
      name, description || '', servings || 4, prep_time || 0, cook_time || 0, 
      instructions || '', JSON.stringify(tags || []), calories || 0, protein || 0, 
      carbs || 0, fat || 0, difficulty || 'medium', cuisine_type || '', recipe_type || 'dinner',
      source_url || '', image_url || '', req.params.id
    ]);
    
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    // Replace ingredients
    await query('DELETE FROM ingredients WHERE recipe_id = ?', [req.params.id]);
    if (ingredients?.length) {
      for (const ing of ingredients) {
        if (ing.name && ing.name.trim()) {
          await query('INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)', [
            uuidv4(), req.params.id, ing.name.trim(), ing.quantity || 1, ing.unit || '', ing.category || 'other'
          ]);
        }
      }
    }
    
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    const recipe = recipes[0];
    recipe.tags = JSON.parse(recipe.tags || '[]');
    recipe.ingredients = await query('SELECT * FROM ingredients WHERE recipe_id = ?', [req.params.id]);
    
    res.json(recipe);
  } catch (error) {
    handleError(error, req, res);
  }
});

// Scale recipe serving size
app.post('/api/recipes/:id/scale', async (req, res) => {
  try {
    const { servings } = req.body;
    if (!servings || servings <= 0) {
      return res.status(400).json({ error: 'Valid serving size required' });
    }
    
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipes.length) return res.status(404).json({ error: 'Recipe not found' });
    
    const recipe = recipes[0];
    const ingredients = await query('SELECT * FROM ingredients WHERE recipe_id = ?', [req.params.id]);
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
app.post('/api/recipes/:id/favorite', async (req, res) => {
  try {
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipes.length) return res.status(404).json({ error: 'Recipe not found' });
    
    const recipe = recipes[0];
    const newFavoriteStatus = pool ? !recipe.is_favorite : (recipe.is_favorite ? 0 : 1);
    
    const updateSql = pool 
      ? 'UPDATE recipes SET is_favorite = $1, updated_at = NOW() WHERE id = $2'
      : 'UPDATE recipes SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?';
    
    await query(updateSql, [newFavoriteStatus, req.params.id]);
    
    res.json({ is_favorite: !!newFavoriteStatus });
  } catch (error) {
    handleError(error, req, res);
  }
});

// Add rating
app.post('/api/recipes/:id/rate', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipes.length) return res.status(404).json({ error: 'Recipe not found' });
    
    // Add new rating
    const ratingId = uuidv4();
    await query('INSERT INTO recipe_ratings (id, recipe_id, rating, comment) VALUES (?, ?, ?, ?)', [
      ratingId, req.params.id, rating, comment || ''
    ]);
    
    // Update recipe average rating
    const ratings = await query('SELECT rating FROM recipe_ratings WHERE recipe_id = ?', [req.params.id]);
    const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    
    const updateSql = pool 
      ? 'UPDATE recipes SET rating = $1, rating_count = $2, updated_at = NOW() WHERE id = $3'
      : 'UPDATE recipes SET rating = ?, rating_count = ?, updated_at = datetime(\'now\') WHERE id = ?';
    
    await query(updateSql, [Math.round(avgRating * 10) / 10, ratings.length, req.params.id]);
    
    res.status(201).json({ rating: Math.round(avgRating * 10) / 10, rating_count: ratings.length });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ ENHANCED MEAL PLAN ============

app.get('/api/meals', async (req, res) => {
  try {
    const { start, end, recipe_id } = req.query;
    let meals;
    
    if (start && end) {
      const sql = `
        SELECT mp.*, r.name as recipe_name, r.prep_time, r.cook_time, r.servings, r.difficulty, r.image_url as recipe_image
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
      `;
      meals = await query(sql, [start, end]);
    } else if (recipe_id) {
      const sql = `
        SELECT mp.*, r.name as recipe_name 
        FROM meal_plan mp 
        LEFT JOIN recipes r ON mp.recipe_id = r.id 
        WHERE mp.recipe_id = ? 
        ORDER BY mp.date DESC 
        LIMIT 20
      `;
      meals = await query(sql, [recipe_id]);
    } else {
      const sql = `
        SELECT mp.*, r.name as recipe_name 
        FROM meal_plan mp 
        LEFT JOIN recipes r ON mp.recipe_id = r.id 
        ORDER BY mp.date DESC, mp.meal_type 
        LIMIT 100
      `;
      meals = await query(sql, []);
    }
    
    res.json(meals);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/meals', async (req, res) => {
  try {
    const id = uuidv4();
    const { recipe_id, date, meal_type, notes, custom_name } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    if (!recipe_id && !custom_name) {
      return res.status(400).json({ error: 'Either recipe_id or custom_name is required' });
    }
    
    await query('INSERT INTO meal_plan (id, recipe_id, date, meal_type, notes, custom_name) VALUES (?, ?, ?, ?, ?, ?)', [
      id, recipe_id || null, date, meal_type || 'dinner', notes || '', custom_name || ''
    ]);
    
    const meals = await query(`
      SELECT mp.*, r.name as recipe_name, r.prep_time, r.cook_time, r.servings, r.image_url as recipe_image 
      FROM meal_plan mp 
      LEFT JOIN recipes r ON mp.recipe_id = r.id 
      WHERE mp.id = ?
    `, [id]);
    
    res.status(201).json(meals[0]);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.put('/api/meals/:id', async (req, res) => {
  try {
    const { recipe_id, date, meal_type, notes, custom_name } = req.body;
    
    const result = await query('UPDATE meal_plan SET recipe_id=?, date=?, meal_type=?, notes=?, custom_name=? WHERE id=?', [
      recipe_id || null, date, meal_type || 'dinner', notes || '', custom_name || '', req.params.id
    ]);
    
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    
    const meals = await query(`
      SELECT mp.*, r.name as recipe_name, r.prep_time, r.cook_time, r.servings, r.image_url as recipe_image 
      FROM meal_plan mp 
      LEFT JOIN recipes r ON mp.recipe_id = r.id 
      WHERE mp.id = ?
    `, [req.params.id]);
    
    res.json(meals[0]);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM meal_plan WHERE id = ?', [req.params.id]);
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ MEAL TEMPLATES ============

app.get('/api/meal-templates', async (req, res) => {
  try {
    const templates = await query('SELECT * FROM meal_templates ORDER BY name', []);
    for (const template of templates) {
      template.template_data = JSON.parse(template.template_data);
    }
    res.json(templates);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/meal-templates', async (req, res) => {
  try {
    const { name, description, start_date, end_date } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    // Get meals for the date range
    const meals = await query(`
      SELECT recipe_id, date, meal_type, notes, custom_name 
      FROM meal_plan 
      WHERE date >= ? AND date <= ?
      ORDER BY date, meal_type
    `, [start_date, end_date]);
    
    const templateId = uuidv4();
    await query('INSERT INTO meal_templates (id, name, description, template_data) VALUES (?, ?, ?, ?)', [
      templateId, name, description || '', JSON.stringify(meals)
    ]);
    
    const templates = await query('SELECT * FROM meal_templates WHERE id = ?', [templateId]);
    const template = templates[0];
    template.template_data = JSON.parse(template.template_data);
    
    res.status(201).json(template);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/meal-templates/:id/apply', async (req, res) => {
  try {
    const { start_date, clear_existing } = req.body;
    
    if (!start_date) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    
    const templates = await query('SELECT * FROM meal_templates WHERE id = ?', [req.params.id]);
    if (!templates.length) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = templates[0];
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
      
      await query('DELETE FROM meal_plan WHERE date >= ? AND date <= ?', [
        newStartDate.toISOString().split('T')[0], 
        newEndDate.toISOString().split('T')[0]
      ]);
    }
    
    // Apply template
    const addedMeals = [];
    
    for (const meal of templateData) {
      const originalDate = new Date(meal.date);
      const newDate = new Date(originalDate.getTime() + daysDiff * 24 * 60 * 60 * 1000);
      const newMealId = uuidv4();
      
      await query('INSERT INTO meal_plan (id, recipe_id, date, meal_type, notes, custom_name) VALUES (?, ?, ?, ?, ?, ?)', [
        newMealId, 
        meal.recipe_id, 
        newDate.toISOString().split('T')[0],
        meal.meal_type,
        meal.notes || '',
        meal.custom_name || ''
      ]);
      
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

app.delete('/api/meal-templates/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM meal_templates WHERE id = ?', [req.params.id]);
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ ENHANCED SHOPPING LIST ============

app.get('/api/shopping', async (req, res) => {
  try {
    const { category } = req.query;
    
    let sql = `
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon, ga.sort_order
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      ${category ? 'WHERE sl.aisle_id = ?' : ''}
      ORDER BY ga.sort_order ASC, sl.checked ASC, sl.name ASC
    `;
    
    const items = category 
      ? await query(sql, [category])
      : await query(sql, []);
    
    res.json(items);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.get('/api/grocery-aisles', async (req, res) => {
  try {
    const aisles = await query('SELECT * FROM grocery_aisles ORDER BY sort_order', []);
    res.json(aisles);
  } catch (error) {
    handleError(error, req, res);
  }
});

// Generate shopping list from meal plan date range
app.post('/api/shopping/generate', async (req, res) => {
  try {
    const { start, end, clear_existing, include_servings } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    
    if (clear_existing) {
      await query("DELETE FROM shopping_list WHERE week_of = ?", [start]);
    }
    
    // Get all meals in range that have recipes
    const meals = await query(`
      SELECT mp.recipe_id, r.servings, COUNT(*) as meal_count
      FROM meal_plan mp 
      JOIN recipes r ON mp.recipe_id = r.id
      WHERE mp.date >= ? AND mp.date <= ? AND mp.recipe_id IS NOT NULL
      GROUP BY mp.recipe_id, r.servings
    `, [start, end]);
    
    if (!meals.length) return res.json([]);
    
    // Aggregate ingredients
    const ingredientMap = new Map();
    for (const meal of meals) {
      const ings = await query('SELECT * FROM ingredients WHERE recipe_id = ?', [meal.recipe_id]);
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
    const addedItems = [];
    
    for (const [, item] of ingredientMap) {
      const id = uuidv4();
      await query('INSERT INTO shopping_list (id, name, quantity, unit, category, aisle_id, week_of) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        id, item.name, Math.round(item.quantity * 100) / 100, item.unit, item.category, item.aisle_id, start
      ]);
      addedItems.push(id);
    }
    
    const items = await query(`
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon 
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      WHERE sl.week_of = ? 
      ORDER BY ga.sort_order, sl.name
    `, [start]);
    
    res.json({ items, added_count: addedItems.length });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/shopping', async (req, res) => {
  try {
    const id = uuidv4();
    const { name, quantity, unit, category, aisle_id } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    await query('INSERT INTO shopping_list (id, name, quantity, unit, category, aisle_id) VALUES (?, ?, ?, ?, ?, ?)', [
      id, name.trim(), quantity || 1, unit || '', category || 'other', aisle_id || 'other'
    ]);
    
    const items = await query(`
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon 
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      WHERE sl.id = ?
    `, [id]);
    
    res.status(201).json(items[0]);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.patch('/api/shopping/:id', async (req, res) => {
  try {
    const { checked, aisle_id } = req.body;
    
    let sql = '';
    let params = [];
    
    if (checked !== undefined) {
      sql = 'UPDATE shopping_list SET checked = ? WHERE id = ?';
      params = [checked ? (pool ? true : 1) : (pool ? false : 0), req.params.id];
    } else if (aisle_id !== undefined) {
      sql = 'UPDATE shopping_list SET aisle_id = ? WHERE id = ?';
      params = [aisle_id, req.params.id];
    } else {
      return res.status(400).json({ error: 'No valid field to update' });
    }
    
    const result = await query(sql, params);
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const items = await query(`
      SELECT sl.*, ga.name as aisle_name, ga.icon as aisle_icon 
      FROM shopping_list sl
      LEFT JOIN grocery_aisles ga ON sl.aisle_id = ga.id
      WHERE sl.id = ?
    `, [req.params.id]);
    
    res.json(items[0]);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/shopping/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM shopping_list WHERE id = ?', [req.params.id]);
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/shopping', async (req, res) => {
  try {
    const { checked_only } = req.query;
    
    if (checked_only === 'true') {
      await query(`DELETE FROM shopping_list WHERE checked = ${pool ? 'true' : '1'}`, []);
    } else {
      await query('DELETE FROM shopping_list', []);
    }
    
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ ANALYTICS & STATS ============

app.get('/api/stats', async (req, res) => {
  try {
    const totalRecipesResult = await query('SELECT COUNT(*) as count FROM recipes', []);
    const favoriteRecipesResult = await query(`SELECT COUNT(*) as count FROM recipes WHERE is_favorite = ${pool ? 'true' : '1'}`, []);
    const totalMealsResult = await query('SELECT COUNT(*) as count FROM meal_plan', []);
    const avgRatingResult = await query('SELECT AVG(rating) as avg FROM recipes WHERE rating > 0', []);
    const shoppingItemsResult = await query('SELECT COUNT(*) as count FROM shopping_list', []);
    const popularRecipes = await query(`
      SELECT r.id, r.name, r.rating, COUNT(mp.id) as usage_count
      FROM recipes r
      LEFT JOIN meal_plan mp ON r.id = mp.recipe_id
      GROUP BY r.id, r.name, r.rating
      ORDER BY usage_count DESC, r.rating DESC
      LIMIT 10
    `, []);
    
    const recentActivitySql = pool ? `
      SELECT 'meal' as type, date, custom_name as name, meal_type as extra
      FROM meal_plan 
      WHERE date >= (CURRENT_DATE - INTERVAL '7 days')
      UNION ALL
      SELECT 'recipe' as type, DATE(created_at) as date, name, cuisine_type as extra
      FROM recipes 
      WHERE created_at >= (NOW() - INTERVAL '7 days')
      ORDER BY date DESC
      LIMIT 20
    ` : `
      SELECT 'meal' as type, date, custom_name as name, meal_type as extra
      FROM meal_plan 
      WHERE date >= date('now', '-7 days')
      UNION ALL
      SELECT 'recipe' as type, date(created_at) as date, name, cuisine_type as extra
      FROM recipes 
      WHERE created_at >= datetime('now', '-7 days')
      ORDER BY date DESC
      LIMIT 20
    `;
    
    const recentActivity = await query(recentActivitySql, []);
    
    const stats = {
      total_recipes: totalRecipesResult[0].count,
      favorite_recipes: favoriteRecipesResult[0].count,
      total_meals_planned: totalMealsResult[0].count,
      avg_recipe_rating: avgRatingResult[0].avg || 0,
      shopping_list_items: shoppingItemsResult[0].count,
      popular_recipes: popularRecipes,
      recent_activity: recentActivity
    };
    
    stats.avg_recipe_rating = Math.round(stats.avg_recipe_rating * 10) / 10;
    
    res.json(stats);
  } catch (error) {
    handleError(error, req, res);
  }
});

// ============ API SOURCES SETTINGS ============

app.get('/api/settings/api-sources', async (req, res) => {
  try {
    const sources = await query('SELECT * FROM api_sources ORDER BY name', []);
    // Mask API keys in response
    const masked = sources.map(s => ({
      ...s,
      api_key_set: !!(s.api_key && s.api_key.trim()),
      api_key: s.api_key ? '••••••••' + s.api_key.slice(-4) : '',
      enabled: pool ? s.enabled : !!s.enabled
    }));
    res.json(masked);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.put('/api/settings/api-sources/:id', async (req, res) => {
  try {
    const { enabled, api_key, name, base_url, icon, description, free_tier_limit } = req.body;
    const updates = [];
    const params = [];

    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(pool ? enabled : (enabled ? 1 : 0));
    }
    if (api_key !== undefined) {
      updates.push('api_key = ?');
      params.push(api_key);
    }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (base_url !== undefined) { updates.push('base_url = ?'); params.push(base_url); }
    if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (free_tier_limit !== undefined) { updates.push('free_tier_limit = ?'); params.push(free_tier_limit); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push(pool ? 'updated_at = NOW()' : "updated_at = datetime('now')");
    params.push(req.params.id);

    await query(`UPDATE api_sources SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const sources = await query('SELECT * FROM api_sources WHERE id = ?', [req.params.id]);
    if (!sources.length) return res.status(404).json({ error: 'Source not found' });
    
    const s = sources[0];
    res.json({ ...s, api_key_set: !!(s.api_key && s.api_key.trim()), api_key: s.api_key ? '••••••••' + s.api_key.slice(-4) : '', enabled: pool ? s.enabled : !!s.enabled });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/settings/api-sources', async (req, res) => {
  try {
    const { name, base_url, api_key, icon, description, free_tier_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const id = uuidv4();
    await query('INSERT INTO api_sources (id, name, base_url, api_key, enabled, icon, description, free_tier_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      id, name, base_url || '', api_key || '', pool ? false : 0, icon || '🔌', description || '', free_tier_limit || 0
    ]);

    const sources = await query('SELECT * FROM api_sources WHERE id = ?', [id]);
    const s = sources[0];
    res.status(201).json({ ...s, api_key_set: !!(s.api_key && s.api_key.trim()), api_key: s.api_key ? '••••••••' + s.api_key.slice(-4) : '', enabled: pool ? s.enabled : !!s.enabled });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/api/settings/api-sources/:id/test', async (req, res) => {
  try {
    const sources = await query('SELECT * FROM api_sources WHERE id = ?', [req.params.id]);
    if (!sources.length) return res.status(404).json({ error: 'Source not found' });

    const source = sources[0];
    let success = false;
    let message = '';
    const startTime = Date.now();

    try {
      if (source.id === 'themealdb' || source.base_url.includes('themealdb.com')) {
        const resp = await fetch(`${source.base_url}/search.php?s=chicken`, { signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        success = resp.ok && data.meals && data.meals.length > 0;
        message = success ? `Connected! Found ${data.meals.length} recipes.` : 'Connected but no results returned.';
      } else if (source.id === 'spoonacular' || source.base_url.includes('spoonacular.com')) {
        if (!source.api_key) { success = false; message = 'API key required.'; }
        else {
          const resp = await fetch(`${source.base_url}/recipes/random?number=1&apiKey=${source.api_key}`, { signal: AbortSignal.timeout(8000) });
          if (resp.status === 401 || resp.status === 403) { success = false; message = 'Invalid API key.'; }
          else { const data = await resp.json(); success = resp.ok && data.recipes?.length > 0; message = success ? 'Connected successfully!' : 'Connected but unexpected response.'; }
        }
      } else if (source.id === 'dummyjson' || source.base_url.includes('dummyjson.com')) {
        const resp = await fetch(`https://dummyjson.com/recipes?limit=1`, { signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        success = resp.ok && data.recipes && data.recipes.length > 0;
        message = success ? `Connected! ${data.total} recipes available.` : 'Connected but no results returned.';
      } else if (source.id === 'thecocktaildb' || source.base_url.includes('thecocktaildb.com')) {
        const resp = await fetch(`${COCKTAILDB_BASE}/search.php?s=margarita`, { signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        success = resp.ok && data.drinks && data.drinks.length > 0;
        message = success ? `Connected! Found ${data.drinks.length} drinks.` : 'Connected but no results returned.';
      } else if (source.id === 'edamam' || source.base_url.includes('edamam.com')) {
        if (!source.api_key) { success = false; message = 'API key (app_id|app_key format) required.'; }
        else {
          const [appId, appKey] = source.api_key.split('|');
          if (!appId || !appKey) { success = false; message = 'Key format: app_id|app_key'; }
          else {
            const resp = await fetch(`${source.base_url}/api/recipes/v2?type=public&q=chicken&app_id=${appId}&app_key=${appKey}`, { signal: AbortSignal.timeout(8000) });
            success = resp.ok;
            message = success ? 'Connected successfully!' : `Error: ${resp.status}`;
          }
        }
      } else {
        // Custom source — just try a GET
        const resp = await fetch(source.base_url, { signal: AbortSignal.timeout(8000) });
        success = resp.ok;
        message = success ? `Connected! Status: ${resp.status}` : `Failed: ${resp.status}`;
      }
    } catch (err) {
      success = false;
      message = `Connection failed: ${err.message}`;
    }

    const latency = Date.now() - startTime;
    const testStatus = success ? 'success' : 'failed';

    const updateSql = pool
      ? "UPDATE api_sources SET last_tested = NOW(), test_status = $1, updated_at = NOW() WHERE id = $2"
      : "UPDATE api_sources SET last_tested = datetime('now'), test_status = ?, updated_at = datetime('now') WHERE id = ?";
    await query(updateSql, [testStatus, req.params.id]);

    res.json({ success, message, latency_ms: latency, test_status: testStatus });
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/api/settings/api-sources/:id', async (req, res) => {
  try {
    // Don't allow deleting default sources
    const builtIn = ['themealdb', 'spoonacular', 'dummyjson', 'thecocktaildb'];
    if (builtIn.includes(req.params.id)) {
      return res.status(400).json({ error: 'Cannot delete built-in API sources' });
    }
    const result = await query('DELETE FROM api_sources WHERE id = ?', [req.params.id]);
    if ((pool && result.length === 0) || (!pool && result.changes === 0)) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(error, req, res);
  }
});

// Helper: get enabled sources
async function getEnabledSources() {
  const enabledVal = pool ? 'true' : '1';
  return await query(`SELECT * FROM api_sources WHERE enabled = ${enabledVal}`, []);
}

// ============ API SOURCE HELPERS ============

async function incrementSourceRequests(sourceId) {
  try {
    await query(
      pool
        ? `UPDATE api_sources SET requests_today = requests_today + 1, updated_at = NOW() WHERE id = $1`
        : `UPDATE api_sources SET requests_today = requests_today + 1, updated_at = datetime('now') WHERE id = ?`,
      [sourceId]
    );
  } catch (e) {
    console.error('Failed to increment requests for', sourceId, e.message);
  }
}

function getSourceByName(sources, name) {
  return sources.find(s => s.name?.toLowerCase() === name.toLowerCase() || s.id === name);
}

// ============ SPOONACULAR API HELPERS ============

const SPOONACULAR_BASE = 'https://api.spoonacular.com';

function parseSpoonacularRecipe(recipe) {
  const ingredients = (recipe.extendedIngredients || []).map(ing => ({
    name: ing.name || ing.originalName || '',
    quantity: ing.amount || 0,
    unit: ing.unit || ''
  }));

  let instructions = '';
  if (recipe.analyzedInstructions?.length > 0) {
    instructions = recipe.analyzedInstructions[0].steps
      ?.map(s => `${s.number}. ${s.step}`)
      .join('\n') || '';
  }
  if (!instructions && recipe.instructions) {
    instructions = recipe.instructions.replace(/<[^>]+>/g, '');
  }

  const tags = [];
  if (recipe.dishTypes) tags.push(...recipe.dishTypes.slice(0, 3));
  if (recipe.diets) tags.push(...recipe.diets.slice(0, 2));

  return {
    name: recipe.title || '',
    description: recipe.summary ? recipe.summary.replace(/<[^>]+>/g, '').slice(0, 200) + '...' : '',
    servings: recipe.servings || 4,
    prep_time: recipe.preparationMinutes || 15,
    cook_time: recipe.cookingMinutes || recipe.readyInMinutes || 30,
    instructions,
    tags,
    ingredients,
    calories: 0, protein: 0, carbs: 0, fat: 0,
    difficulty: recipe.readyInMinutes > 60 ? 'hard' : recipe.readyInMinutes > 30 ? 'medium' : 'easy',
    cuisine_type: (recipe.cuisines?.[0] || '').toLowerCase(),
    recipe_type: recipe.dishTypes?.[0] || 'dinner',
    source_url: recipe.sourceUrl || '',
    image_url: recipe.image || '',
    import_source: 'spoonacular',
    source_api: 'spoonacular',
    spoonacular_id: String(recipe.id)
  };
}

async function spoonacularSearch(apiKey, searchQuery) {
  const url = `${SPOONACULAR_BASE}/recipes/complexSearch?query=${encodeURIComponent(searchQuery)}&number=10&addRecipeInformation=true&fillIngredients=true&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spoonacular API error: ${response.status}`);
  const data = await response.json();
  return (data.results || []).map(parseSpoonacularRecipe);
}

async function spoonacularRandom(apiKey, count = 3) {
  const url = `${SPOONACULAR_BASE}/recipes/random?number=${count}&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spoonacular API error: ${response.status}`);
  const data = await response.json();
  return (data.recipes || []).map(parseSpoonacularRecipe);
}

async function spoonacularFilterByCuisine(apiKey, cuisine) {
  const url = `${SPOONACULAR_BASE}/recipes/complexSearch?cuisine=${encodeURIComponent(cuisine)}&number=10&addRecipeInformation=true&fillIngredients=true&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spoonacular API error: ${response.status}`);
  const data = await response.json();
  return (data.results || []).map(parseSpoonacularRecipe);
}

async function spoonacularFilterByType(apiKey, type) {
  const url = `${SPOONACULAR_BASE}/recipes/complexSearch?type=${encodeURIComponent(type)}&number=10&addRecipeInformation=true&fillIngredients=true&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spoonacular API error: ${response.status}`);
  const data = await response.json();
  return (data.results || []).map(parseSpoonacularRecipe);
}

// ============ TheMealDB API PROXY ============

const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

function parseMealDBRecipe(meal) {
  // Extract ingredients and measures from strIngredient1-20 / strMeasure1-20
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (name && name.trim()) {
      const measureStr = (measure || '').trim();
      // Try to extract numeric quantity from measure
      const qtyMatch = measureStr.match(/^([\d./½¼¾⅓⅔]+)\s*(.*)/);
      let quantity = 1;
      let unit = measureStr;
      if (qtyMatch) {
        let q = qtyMatch[1].replace('½', '.5').replace('¼', '.25').replace('¾', '.75').replace('⅓', '.33').replace('⅔', '.67');
        // Handle fractions like "1/2"
        if (q.includes('/')) {
          const [num, den] = q.split('/');
          quantity = parseFloat(num) / parseFloat(den);
        } else {
          quantity = parseFloat(q) || 1;
        }
        unit = qtyMatch[2] || '';
      }
      ingredients.push({ name: name.trim(), quantity, unit, category: 'other' });
    }
  }

  const tags = meal.strTags ? meal.strTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  if (meal.strCategory) tags.push(meal.strCategory);

  return {
    name: meal.strMeal || '',
    description: `${meal.strCategory || ''} dish from ${meal.strArea || 'unknown'} cuisine.`,
    servings: 4,
    prep_time: 15,
    cook_time: 30,
    instructions: meal.strInstructions || '',
    tags,
    ingredients,
    calories: 0, protein: 0, carbs: 0, fat: 0,
    difficulty: 'medium',
    cuisine_type: (meal.strArea || '').toLowerCase(),
    recipe_type: 'dinner',
    source_url: meal.strSource || meal.strYoutube || '',
    image_url: meal.strMealThumb || '',
    import_source: 'themealdb',
    source_api: 'themealdb',
    mealdb_id: meal.idMeal
  };
}

// Search — queries all enabled sources in parallel
app.get('/api/discover/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ results: [], warnings: [] });
    
    const sources = await getEnabledSources();
    const promises = [];
    const warnings = [];
    
    // TheMealDB (always available, no key needed)
    const mealdbSource = getSourceByName(sources, 'themealdb');
    if (mealdbSource) {
      promises.push(
        fetch(`${MEALDB_BASE}/search.php?s=${encodeURIComponent(q)}`)
          .then(r => r.json())
          .then(data => {
            incrementSourceRequests(mealdbSource.id);
            return (data.meals || []).map(parseMealDBRecipe);
          })
          .catch(err => { warnings.push({ source: 'themealdb', error: err.message }); return []; })
      );
    }
    
    // Spoonacular (needs API key)
    const spoonSource = getSourceByName(sources, 'spoonacular');
    if (spoonSource && spoonSource.api_key) {
      promises.push(
        spoonacularSearch(spoonSource.api_key, q)
          .then(results => { incrementSourceRequests(spoonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'spoonacular', error: err.message }); return []; })
      );
    }
    
    // DummyJSON (no key needed)
    const dummyjsonSource = getSourceByName(sources, 'dummyjson');
    if (dummyjsonSource) {
      promises.push(
        dummyjsonSearch(q)
          .then(results => { incrementSourceRequests(dummyjsonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'dummyjson', error: err.message }); return []; })
      );
    }
    
    // TheCocktailDB (no key needed)
    const cocktailSource = getSourceByName(sources, 'thecocktaildb');
    if (cocktailSource) {
      promises.push(
        cocktaildbSearch(q)
          .then(results => { incrementSourceRequests(cocktailSource.id); return results; })
          .catch(err => { warnings.push({ source: 'thecocktaildb', error: err.message }); return []; })
      );
    }
    
    const resultArrays = await Promise.all(promises);
    // Interleave results from different sources
    const combined = [];
    const maxLen = Math.max(...resultArrays.map(a => a.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const arr of resultArrays) {
        if (i < arr.length) combined.push(arr[i]);
      }
    }
    
    res.json({ results: combined, warnings });
  } catch (error) {
    console.error('Multi-source search error:', error);
    res.status(500).json({ error: 'Failed to search recipes' });
  }
});

// Get random meal — queries all enabled sources
app.get('/api/discover/random', async (req, res) => {
  try {
    const sources = await getEnabledSources();
    const promises = [];
    const warnings = [];
    
    const mealdbSource = getSourceByName(sources, 'themealdb');
    if (mealdbSource) {
      promises.push(
        fetch(`${MEALDB_BASE}/random.php`)
          .then(r => r.json())
          .then(data => { incrementSourceRequests(mealdbSource.id); return (data.meals || []).map(parseMealDBRecipe); })
          .catch(err => { warnings.push({ source: 'themealdb', error: err.message }); return []; })
      );
    }
    
    const spoonSource = getSourceByName(sources, 'spoonacular');
    if (spoonSource && spoonSource.api_key) {
      promises.push(
        spoonacularRandom(spoonSource.api_key, 2)
          .then(results => { incrementSourceRequests(spoonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'spoonacular', error: err.message }); return []; })
      );
    }
    
    // DummyJSON random
    const dummyjsonSource = getSourceByName(sources, 'dummyjson');
    if (dummyjsonSource) {
      promises.push(
        dummyjsonRandom(2)
          .then(results => { incrementSourceRequests(dummyjsonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'dummyjson', error: err.message }); return []; })
      );
    }
    
    // CocktailDB random
    const cocktailSource = getSourceByName(sources, 'thecocktaildb');
    if (cocktailSource) {
      promises.push(
        cocktaildbRandom(1)
          .then(results => { incrementSourceRequests(cocktailSource.id); return results; })
          .catch(err => { warnings.push({ source: 'thecocktaildb', error: err.message }); return []; })
      );
    }
    
    const resultArrays = await Promise.all(promises);
    const combined = resultArrays.flat();
    
    res.json({ results: combined, warnings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get random recipe' });
  }
});

// List categories
app.get('/api/discover/categories', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/categories.php`);
    const data = await response.json();
    res.json(data.categories || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// Filter by category — queries both sources
app.get('/api/discover/filter/category/:category', async (req, res) => {
  try {
    const sources = await getEnabledSources();
    const promises = [];
    const warnings = [];
    
    const mealdbSource = getSourceByName(sources, 'themealdb');
    if (mealdbSource) {
      promises.push(
        fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(req.params.category)}`)
          .then(r => r.json())
          .then(data => {
            incrementSourceRequests(mealdbSource.id);
            return (data.meals || []).map(m => ({
              mealdb_id: m.idMeal, name: m.strMeal, image_url: m.strMealThumb, source_api: 'themealdb'
            }));
          })
          .catch(err => { warnings.push({ source: 'themealdb', error: err.message }); return []; })
      );
    }
    
    const spoonSource = getSourceByName(sources, 'spoonacular');
    if (spoonSource && spoonSource.api_key) {
      promises.push(
        spoonacularFilterByType(spoonSource.api_key, req.params.category.toLowerCase())
          .then(results => { incrementSourceRequests(spoonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'spoonacular', error: err.message }); return []; })
      );
    }
    
    // DummyJSON filter by tag (categories map to tags)
    const dummyjsonSource = getSourceByName(sources, 'dummyjson');
    if (dummyjsonSource) {
      promises.push(
        dummyjsonFilterByTag(req.params.category)
          .then(results => { incrementSourceRequests(dummyjsonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'dummyjson', error: err.message }); return []; })
      );
    }
    
    // CocktailDB filter by category
    const cocktailSource = getSourceByName(sources, 'thecocktaildb');
    if (cocktailSource) {
      promises.push(
        cocktaildbFilterByCategory(req.params.category)
          .then(results => { incrementSourceRequests(cocktailSource.id); return results; })
          .catch(err => { warnings.push({ source: 'thecocktaildb', error: err.message }); return []; })
      );
    }
    
    const resultArrays = await Promise.all(promises);
    const combined = resultArrays.flat();
    res.json({ results: combined, warnings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to filter by category' });
  }
});

// Filter by area/cuisine — queries both sources
app.get('/api/discover/filter/area/:area', async (req, res) => {
  try {
    const sources = await getEnabledSources();
    const promises = [];
    const warnings = [];
    
    const mealdbSource = getSourceByName(sources, 'themealdb');
    if (mealdbSource) {
      promises.push(
        fetch(`${MEALDB_BASE}/filter.php?a=${encodeURIComponent(req.params.area)}`)
          .then(r => r.json())
          .then(data => {
            incrementSourceRequests(mealdbSource.id);
            return (data.meals || []).map(m => ({
              mealdb_id: m.idMeal, name: m.strMeal, image_url: m.strMealThumb, source_api: 'themealdb'
            }));
          })
          .catch(err => { warnings.push({ source: 'themealdb', error: err.message }); return []; })
      );
    }
    
    const spoonSource = getSourceByName(sources, 'spoonacular');
    if (spoonSource && spoonSource.api_key) {
      promises.push(
        spoonacularFilterByCuisine(spoonSource.api_key, req.params.area)
          .then(results => { incrementSourceRequests(spoonSource.id); return results; })
          .catch(err => { warnings.push({ source: 'spoonacular', error: err.message }); return []; })
      );
    }
    
    // DummyJSON search by cuisine/area name
    const dummyjsonSource = getSourceByName(sources, 'dummyjson');
    if (dummyjsonSource) {
      promises.push(
        dummyjsonSearch(req.params.area)
          .then(results => { incrementSourceRequests(dummyjsonSource.id); return results.filter(r => r.cuisine_type.toLowerCase() === req.params.area.toLowerCase()); })
          .catch(err => { warnings.push({ source: 'dummyjson', error: err.message }); return []; })
      );
    }
    
    // CocktailDB doesn't have area filtering, skip for this endpoint
    
    const resultArrays = await Promise.all(promises);
    const combined = resultArrays.flat();
    res.json({ results: combined, warnings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to filter by area' });
  }
});

// List areas (cuisines)
app.get('/api/discover/areas', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/list.php?a=list`);
    const data = await response.json();
    res.json((data.meals || []).map(m => m.strArea));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load areas' });
  }
});

// Lookup full recipe by MealDB ID
app.get('/api/discover/lookup/:id', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/lookup.php?i=${req.params.id}`);
    const data = await response.json();
    if (!data.meals || !data.meals.length) return res.status(404).json({ error: 'Recipe not found' });
    res.json(parseMealDBRecipe(data.meals[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to lookup recipe' });
  }
});

// Lookup full recipe by DummyJSON ID
app.get('/api/discover/lookup/dummyjson/:id', async (req, res) => {
  try {
    const response = await fetch(`https://dummyjson.com/recipes/${req.params.id}`);
    const data = await response.json();
    if (!data.id) return res.status(404).json({ error: 'Recipe not found' });
    res.json(parseDummyJSONRecipe(data));
  } catch (error) {
    res.status(500).json({ error: 'Failed to lookup recipe' });
  }
});

// Lookup full drink by CocktailDB ID
app.get('/api/discover/lookup/cocktaildb/:id', async (req, res) => {
  try {
    const response = await fetch(`${COCKTAILDB_BASE}/lookup.php?i=${req.params.id}`);
    const data = await response.json();
    if (!data.drinks || !data.drinks.length) return res.status(404).json({ error: 'Drink not found' });
    res.json(parseCocktailDBRecipe(data.drinks[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to lookup drink' });
  }
});

// ============ DummyJSON Recipes API HELPERS ============

const DUMMYJSON_BASE = 'https://dummyjson.com/recipes';

function parseDummyJSONRecipe(recipe) {
  const ingredients = (recipe.ingredients || []).map(ing => {
    const match = ing.match(/^([\d./½¼¾⅓⅔]+)\s*([\w]+)?\s*(.*)/);
    if (match) {
      let q = match[1].replace('½', '.5').replace('¼', '.25').replace('¾', '.75').replace('⅓', '.33').replace('⅔', '.67');
      if (q.includes('/')) { const [n, d] = q.split('/'); q = String(parseFloat(n) / parseFloat(d)); }
      return { name: match[3] || ing, quantity: parseFloat(q) || 1, unit: match[2] || '', category: 'other' };
    }
    return { name: ing, quantity: 1, unit: '', category: 'other' };
  });

  const instructions = Array.isArray(recipe.instructions)
    ? recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : (recipe.instructions || '');

  const tags = (recipe.tags || []).slice(0, 5);
  if (recipe.cuisine) tags.push(recipe.cuisine);

  return {
    name: recipe.name || '',
    description: `${recipe.difficulty || ''} ${recipe.cuisine || ''} recipe. ${recipe.caloriesPerServing ? recipe.caloriesPerServing + ' cal/serving.' : ''}`.trim(),
    servings: recipe.servings || 4,
    prep_time: recipe.prepTimeMinutes || 15,
    cook_time: recipe.cookTimeMinutes || 30,
    instructions,
    tags,
    ingredients,
    calories: recipe.caloriesPerServing || 0, protein: 0, carbs: 0, fat: 0,
    difficulty: (recipe.difficulty || 'medium').toLowerCase(),
    cuisine_type: (recipe.cuisine || '').toLowerCase(),
    recipe_type: (recipe.mealType?.[0] || 'dinner').toLowerCase(),
    source_url: '',
    image_url: recipe.image || '',
    import_source: 'dummyjson',
    source_api: 'dummyjson',
    dummyjson_id: String(recipe.id)
  };
}

async function dummyjsonSearch(searchQuery) {
  const url = `${DUMMYJSON_BASE}/search?q=${encodeURIComponent(searchQuery)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DummyJSON API error: ${response.status}`);
  const data = await response.json();
  return (data.recipes || []).map(parseDummyJSONRecipe);
}

async function dummyjsonRandom(count = 3) {
  const skip = Math.floor(Math.random() * 47);
  const url = `${DUMMYJSON_BASE}?limit=${count}&skip=${skip}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DummyJSON API error: ${response.status}`);
  const data = await response.json();
  return (data.recipes || []).map(parseDummyJSONRecipe);
}

async function dummyjsonFilterByTag(tag) {
  const url = `${DUMMYJSON_BASE}/tag/${encodeURIComponent(tag)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DummyJSON API error: ${response.status}`);
  const data = await response.json();
  return (data.recipes || []).map(parseDummyJSONRecipe);
}

// ============ TheCocktailDB API HELPERS ============

const COCKTAILDB_BASE = 'https://www.thecocktaildb.com/api/json/v1/1';

function parseCocktailDBRecipe(drink) {
  const ingredients = [];
  for (let i = 1; i <= 15; i++) {
    const name = drink[`strIngredient${i}`];
    const measure = drink[`strMeasure${i}`];
    if (name && name.trim()) {
      const measureStr = (measure || '').trim();
      const qtyMatch = measureStr.match(/^([\d./½¼¾⅓⅔]+)\s*(.*)/);
      let quantity = 1;
      let unit = measureStr;
      if (qtyMatch) {
        let q = qtyMatch[1].replace('½', '.5').replace('¼', '.25').replace('¾', '.75').replace('⅓', '.33').replace('⅔', '.67');
        if (q.includes('/')) {
          const [num, den] = q.split('/');
          quantity = parseFloat(num) / parseFloat(den);
        } else {
          quantity = parseFloat(q) || 1;
        }
        unit = qtyMatch[2] || '';
      }
      ingredients.push({ name: name.trim(), quantity, unit, category: 'other' });
    }
  }

  const tags = drink.strTags ? drink.strTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  if (drink.strCategory) tags.push(drink.strCategory);
  tags.push('cocktail', 'drink');

  return {
    name: drink.strDrink || '',
    description: `${drink.strCategory || 'Cocktail'} — ${drink.strAlcoholic || ''}.`.trim(),
    servings: 1,
    prep_time: 5,
    cook_time: 0,
    instructions: drink.strInstructions || '',
    tags,
    ingredients,
    calories: 0, protein: 0, carbs: 0, fat: 0,
    difficulty: 'easy',
    cuisine_type: '',
    recipe_type: 'drink',
    source_url: '',
    image_url: drink.strDrinkThumb || '',
    import_source: 'thecocktaildb',
    source_api: 'thecocktaildb',
    cocktaildb_id: drink.idDrink
  };
}

async function cocktaildbSearch(searchQuery) {
  const url = `${COCKTAILDB_BASE}/search.php?s=${encodeURIComponent(searchQuery)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CocktailDB API error: ${response.status}`);
  const data = await response.json();
  return (data.drinks || []).map(parseCocktailDBRecipe);
}

async function cocktaildbRandom(count = 2) {
  const promises = Array.from({ length: count }, () =>
    fetch(`${COCKTAILDB_BASE}/random.php`).then(r => r.json()).then(d => d.drinks?.[0]).catch(() => null)
  );
  const results = await Promise.all(promises);
  return results.filter(Boolean).map(parseCocktailDBRecipe);
}

async function cocktaildbFilterByCategory(category) {
  const url = `${COCKTAILDB_BASE}/filter.php?c=${encodeURIComponent(category)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CocktailDB API error: ${response.status}`);
  const data = await response.json();
  return (data.drinks || []).map(d => ({
    cocktaildb_id: d.idDrink, name: d.strDrink, image_url: d.strDrinkThumb, source_api: 'thecocktaildb'
  }));
}

// ============ RECIPE IMPORT FROM URL ============

// Robust image extraction for recipe import
function extractImage(recipe, $) {
  // 1. Try recipe.image from JSON-LD (multiple formats)
  if (recipe?.image) {
    const img = recipe.image;
    // Direct string URL
    if (typeof img === 'string' && img.startsWith('http')) return img;
    // ImageObject with url
    if (img.url) return img.url;
    // Array of strings or ImageObjects
    if (Array.isArray(img)) {
      for (const item of img) {
        if (typeof item === 'string' && item.startsWith('http')) return item;
        if (item?.url) return item.url;
      }
    }
  }
  // 2. Try recipe.thumbnailUrl
  if (recipe?.thumbnailUrl) return recipe.thumbnailUrl;
  // 3. Fallback to Open Graph meta tag
  if ($) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) return ogImage;
    // 4. Twitter card image
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    if (twitterImage) return twitterImage;
    // 5. First large image in article/main content
    const mainImg = $('article img[src], main img[src], .recipe img[src]').first().attr('src');
    if (mainImg) return mainImg;
  }
  return '';
}

app.post('/api/recipes/import-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MealPlanner/1.0)',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Try JSON-LD structured data first (most recipe sites use this)
    let recipe = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        let data = JSON.parse($(el).html());
        // Handle @graph arrays
        if (data['@graph']) data = data['@graph'];
        if (Array.isArray(data)) {
          data = data.find(d => d['@type'] === 'Recipe' || (Array.isArray(d['@type']) && d['@type'].includes('Recipe')));
        }
        if (data && (data['@type'] === 'Recipe' || (Array.isArray(data['@type']) && data['@type'].includes('Recipe')))) {
          recipe = data;
        }
      } catch (e) { /* skip invalid JSON */ }
    });

    if (!recipe) {
      // Fallback: try to extract from meta tags and page content
      const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      if (!title) return res.status(400).json({ error: 'Could not parse recipe from this URL' });
      
      recipe = { name: title, description: $('meta[property="og:description"]').attr('content') || '' };
    }

    // Parse duration strings like "PT30M" or "PT1H30M"
    const parseDuration = (dur) => {
      if (!dur) return 0;
      if (typeof dur === 'number') return dur;
      const h = dur.match(/(\d+)H/); const m = dur.match(/(\d+)M/);
      return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
    };

    // Parse ingredients
    const parseIngredients = (ings) => {
      if (!ings || !Array.isArray(ings)) return [];
      return ings.map(ing => {
        if (typeof ing === 'string') {
          // Try to extract quantity and unit from string like "2 cups flour"
          const match = ing.match(/^([\d./½¼¾⅓⅔]+)\s*([\w]+)?\s+(.+)/);
          if (match) {
            let qty = match[1];
            // Convert unicode fractions
            qty = qty.replace('½', '.5').replace('¼', '.25').replace('¾', '.75').replace('⅓', '.33').replace('⅔', '.67');
            return { name: match[3].trim(), quantity: parseFloat(qty) || 1, unit: match[2] || '', category: 'other' };
          }
          return { name: ing.trim(), quantity: 1, unit: '', category: 'other' };
        }
        return { name: String(ing), quantity: 1, unit: '', category: 'other' };
      });
    };

    // Parse instructions
    const parseInstructions = (inst) => {
      if (!inst) return '';
      if (typeof inst === 'string') return inst;
      if (Array.isArray(inst)) {
        return inst.map((step, i) => {
          const text = typeof step === 'string' ? step : (step.text || step.name || '');
          return `${i + 1}. ${text}`;
        }).join('\n');
      }
      return '';
    };

    // Parse nutrition
    const nutrition = recipe.nutrition || {};

    const parsed = {
      name: recipe.name || '',
      description: recipe.description || '',
      servings: parseInt(recipe.recipeYield) || 4,
      prep_time: parseDuration(recipe.prepTime),
      cook_time: parseDuration(recipe.cookTime),
      instructions: parseInstructions(recipe.recipeInstructions),
      tags: Array.isArray(recipe.recipeCategory) ? recipe.recipeCategory : (recipe.recipeCategory ? [recipe.recipeCategory] : []),
      ingredients: parseIngredients(recipe.recipeIngredient),
      calories: parseInt(nutrition.calories) || 0,
      protein: parseFloat(nutrition.proteinContent) || 0,
      carbs: parseFloat(nutrition.carbohydrateContent) || 0,
      fat: parseFloat(nutrition.fatContent) || 0,
      difficulty: 'medium',
      cuisine_type: Array.isArray(recipe.recipeCuisine) ? recipe.recipeCuisine[0] : (recipe.recipeCuisine || ''),
      recipe_type: 'dinner',
      source_url: url,
      image_url: extractImage(recipe, $)
    };

    res.json(parsed);
  } catch (error) {
    console.error('Recipe import error:', error);
    res.status(400).json({ error: 'Failed to import recipe from URL. Make sure the URL points to a recipe page.' });
  }
});

// ============ NUTRITIONAL SUMMARY ============

app.get('/api/meals/nutrition', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });

    const meals = await query(`
      SELECT mp.date, mp.meal_type, r.name, r.calories, r.protein, r.carbs, r.fat, r.servings
      FROM meal_plan mp
      JOIN recipes r ON mp.recipe_id = r.id
      WHERE mp.date >= ? AND mp.date <= ?
      ORDER BY mp.date
    `, [start, end]);

    // Group by date
    const daily = {};
    const weekly = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };

    for (const meal of meals) {
      if (!daily[meal.date]) {
        daily[meal.date] = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
      }
      daily[meal.date].calories += meal.calories || 0;
      daily[meal.date].protein += meal.protein || 0;
      daily[meal.date].carbs += meal.carbs || 0;
      daily[meal.date].fat += meal.fat || 0;
      daily[meal.date].meals++;

      weekly.calories += meal.calories || 0;
      weekly.protein += meal.protein || 0;
      weekly.carbs += meal.carbs || 0;
      weekly.fat += meal.fat || 0;
      weekly.meals++;
    }

    res.json({ daily, weekly });
  } catch (error) {
    handleError(error, req, res);
  }
});

// Error handling middleware
app.use(handleError);

// SPA fallback
app.get('/{*path}', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api')) {
    if (existsSync(join(distPath, 'index.html'))) {
      res.sendFile(join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Frontend not built yet. Run: npm run build' });
    }
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Enhanced Meal Planner API running on port ${PORT}`);
  console.log(pool ? 'Connected to PostgreSQL database' : 'Using SQLite fallback database');
});

// Remove Edamam source (no longer supported)
query("DELETE FROM api_sources WHERE id = 'edamam'").catch(() => {});

// Seed new built-in sources (DummyJSON, TheCocktailDB)
// Use DB-appropriate upsert syntax
const insertIgnoreSql = pool
  ? "INSERT INTO api_sources (id, name, base_url, api_key, enabled, icon, description, free_tier_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING"
  : "INSERT OR IGNORE INTO api_sources (id, name, base_url, api_key, enabled, icon, description, free_tier_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
query(insertIgnoreSql,
  ['dummyjson', 'DummyJSON', 'https://dummyjson.com/recipes', '', true, '🧪', 'Free mock recipe API with 50 recipes. No API key required.', 0]).catch((e) => console.error('Seed dummyjson:', e.message));
query(insertIgnoreSql,
  ['thecocktaildb', 'TheCocktailDB', 'https://www.thecocktaildb.com/api/json/v1/1', '', true, '🍸', 'Free cocktail and drink recipe database. No API key required.', 0]).catch((e) => console.error('Seed cocktaildb:', e.message));
