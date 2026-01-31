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
    } else if (sql.includes('SELECT') && sql.toUpperCase().includes('LIMIT 1') || sql.includes('WHERE') && sql.includes('=')) {
      // For single record queries
      const stmt = db.prepare(sql);
      const result = stmt.get(...params);
      return result ? [result] : [];
    } else {
      // For multiple records
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
    mealdb_id: meal.idMeal
  };
}

// Search TheMealDB by name
app.get('/api/discover/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const response = await fetch(`${MEALDB_BASE}/search.php?s=${encodeURIComponent(q)}`);
    const data = await response.json();
    const meals = (data.meals || []).map(parseMealDBRecipe);
    res.json(meals);
  } catch (error) {
    console.error('MealDB search error:', error);
    res.status(500).json({ error: 'Failed to search recipes' });
  }
});

// Get random meal
app.get('/api/discover/random', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/random.php`);
    const data = await response.json();
    const meals = (data.meals || []).map(parseMealDBRecipe);
    res.json(meals);
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

// Filter by category
app.get('/api/discover/filter/category/:category', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(req.params.category)}`);
    const data = await response.json();
    // Filter returns minimal data — just name, thumb, id
    res.json((data.meals || []).map(m => ({
      mealdb_id: m.idMeal,
      name: m.strMeal,
      image_url: m.strMealThumb
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to filter by category' });
  }
});

// Filter by area/cuisine
app.get('/api/discover/filter/area/:area', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/filter.php?a=${encodeURIComponent(req.params.area)}`);
    const data = await response.json();
    res.json((data.meals || []).map(m => ({
      mealdb_id: m.idMeal,
      name: m.strMeal,
      image_url: m.strMealThumb
    })));
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

// ============ RECIPE IMPORT FROM URL ============

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
      image_url: typeof recipe.image === 'string' ? recipe.image : (Array.isArray(recipe.image) ? recipe.image[0] : (recipe.image?.url || ''))
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