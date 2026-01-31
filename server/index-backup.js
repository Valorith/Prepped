import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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

// Database setup
const db = new Database(join(__dirname, 'meal-planner.db'), { wal: true });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    servings INTEGER DEFAULT 4,
    prep_time INTEGER DEFAULT 0,
    cook_time INTEGER DEFAULT 0,
    instructions TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT '',
    category TEXT DEFAULT 'other',
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meal_plan (
    id TEXT PRIMARY KEY,
    recipe_id TEXT,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL DEFAULT 'dinner',
    notes TEXT DEFAULT '',
    custom_name TEXT DEFAULT '',
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS shopping_list (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT '',
    category TEXT DEFAULT 'other',
    checked INTEGER DEFAULT 0,
    week_of TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ============ RECIPES ============

app.get('/api/recipes', (req, res) => {
  const recipes = db.prepare('SELECT * FROM recipes ORDER BY name').all();
  for (const r of recipes) {
    r.tags = JSON.parse(r.tags || '[]');
    r.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(r.id);
  }
  res.json(recipes);
});

app.get('/api/recipes/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  recipe.tags = JSON.parse(recipe.tags || '[]');
  recipe.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(recipe.id);
  res.json(recipe);
});

app.post('/api/recipes', (req, res) => {
  const id = uuidv4();
  const { name, description, servings, prep_time, cook_time, instructions, tags, ingredients } = req.body;
  db.prepare(`INSERT INTO recipes (id, name, description, servings, prep_time, cook_time, instructions, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name, description || '', servings || 4, prep_time || 0, cook_time || 0, instructions || '', JSON.stringify(tags || []));
  
  if (ingredients?.length) {
    const stmt = db.prepare('INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)');
    for (const ing of ingredients) {
      stmt.run(uuidv4(), id, ing.name, ing.quantity || 1, ing.unit || '', ing.category || 'other');
    }
  }
  
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  recipe.tags = JSON.parse(recipe.tags || '[]');
  recipe.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(id);
  res.status(201).json(recipe);
});

app.put('/api/recipes/:id', (req, res) => {
  const { name, description, servings, prep_time, cook_time, instructions, tags, ingredients } = req.body;
  db.prepare(`UPDATE recipes SET name=?, description=?, servings=?, prep_time=?, cook_time=?, instructions=?, tags=?, updated_at=datetime('now')
    WHERE id=?`).run(name, description || '', servings || 4, prep_time || 0, cook_time || 0, instructions || '', JSON.stringify(tags || []), req.params.id);
  
  // Replace ingredients
  db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(req.params.id);
  if (ingredients?.length) {
    const stmt = db.prepare('INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)');
    for (const ing of ingredients) {
      stmt.run(uuidv4(), req.params.id, ing.name, ing.quantity || 1, ing.unit || '', ing.category || 'other');
    }
  }
  
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  recipe.tags = JSON.parse(recipe.tags || '[]');
  recipe.ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(req.params.id);
  res.json(recipe);
});

app.delete('/api/recipes/:id', (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ MEAL PLAN ============

app.get('/api/meals', (req, res) => {
  const { start, end } = req.query;
  let meals;
  if (start && end) {
    meals = db.prepare('SELECT mp.*, r.name as recipe_name FROM meal_plan mp LEFT JOIN recipes r ON mp.recipe_id = r.id WHERE mp.date >= ? AND mp.date <= ? ORDER BY mp.date, mp.meal_type').all(start, end);
  } else {
    meals = db.prepare('SELECT mp.*, r.name as recipe_name FROM meal_plan mp LEFT JOIN recipes r ON mp.recipe_id = r.id ORDER BY mp.date DESC, mp.meal_type LIMIT 100').all();
  }
  res.json(meals);
});

app.post('/api/meals', (req, res) => {
  const id = uuidv4();
  const { recipe_id, date, meal_type, notes, custom_name } = req.body;
  db.prepare('INSERT INTO meal_plan (id, recipe_id, date, meal_type, notes, custom_name) VALUES (?, ?, ?, ?, ?, ?)').run(id, recipe_id || null, date, meal_type || 'dinner', notes || '', custom_name || '');
  const meal = db.prepare('SELECT mp.*, r.name as recipe_name FROM meal_plan mp LEFT JOIN recipes r ON mp.recipe_id = r.id WHERE mp.id = ?').get(id);
  res.status(201).json(meal);
});

app.put('/api/meals/:id', (req, res) => {
  const { recipe_id, date, meal_type, notes, custom_name } = req.body;
  db.prepare('UPDATE meal_plan SET recipe_id=?, date=?, meal_type=?, notes=?, custom_name=? WHERE id=?').run(recipe_id || null, date, meal_type || 'dinner', notes || '', custom_name || '', req.params.id);
  const meal = db.prepare('SELECT mp.*, r.name as recipe_name FROM meal_plan mp LEFT JOIN recipes r ON mp.recipe_id = r.id WHERE mp.id = ?').get(req.params.id);
  res.json(meal);
});

app.delete('/api/meals/:id', (req, res) => {
  db.prepare('DELETE FROM meal_plan WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ SHOPPING LIST ============

app.get('/api/shopping', (req, res) => {
  const items = db.prepare('SELECT * FROM shopping_list ORDER BY category, checked, name').all();
  res.json(items);
});

// Generate shopping list from meal plan date range
app.post('/api/shopping/generate', (req, res) => {
  const { start, end, clear_existing } = req.body;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
  
  if (clear_existing) {
    db.prepare("DELETE FROM shopping_list WHERE week_of = ?").run(start);
  }
  
  // Get all meals in range that have recipes
  const meals = db.prepare('SELECT mp.recipe_id FROM meal_plan mp WHERE mp.date >= ? AND mp.date <= ? AND mp.recipe_id IS NOT NULL').all(start, end);
  const recipeIds = [...new Set(meals.map(m => m.recipe_id))];
  
  if (!recipeIds.length) return res.json([]);
  
  // Aggregate ingredients
  const ingredientMap = new Map();
  for (const rid of recipeIds) {
    const ings = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(rid);
    // Count how many times this recipe appears
    const count = meals.filter(m => m.recipe_id === rid).length;
    for (const ing of ings) {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`;
      if (ingredientMap.has(key)) {
        const existing = ingredientMap.get(key);
        existing.quantity += ing.quantity * count;
      } else {
        ingredientMap.set(key, { name: ing.name, quantity: ing.quantity * count, unit: ing.unit, category: ing.category });
      }
    }
  }
  
  // Insert into shopping list
  const stmt = db.prepare('INSERT INTO shopping_list (id, name, quantity, unit, category, week_of) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [, item] of ingredientMap) {
    stmt.run(uuidv4(), item.name, item.quantity, item.unit, item.category, start);
  }
  
  const items = db.prepare("SELECT * FROM shopping_list WHERE week_of = ? ORDER BY category, name").all(start);
  res.json(items);
});

app.post('/api/shopping', (req, res) => {
  const id = uuidv4();
  const { name, quantity, unit, category } = req.body;
  db.prepare('INSERT INTO shopping_list (id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?)').run(id, name, quantity || 1, unit || '', category || 'other');
  res.status(201).json(db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(id));
});

app.patch('/api/shopping/:id', (req, res) => {
  const { checked } = req.body;
  db.prepare('UPDATE shopping_list SET checked = ? WHERE id = ?').run(checked ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(req.params.id));
});

app.delete('/api/shopping/:id', (req, res) => {
  db.prepare('DELETE FROM shopping_list WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/shopping', (req, res) => {
  const { checked_only } = req.query;
  if (checked_only === 'true') {
    db.prepare('DELETE FROM shopping_list WHERE checked = 1').run();
  } else {
    db.prepare('DELETE FROM shopping_list').run();
  }
  res.json({ ok: true });
});

// SPA fallback
app.get('*path', (req, res) => {
  if (existsSync(join(distPath, 'index.html'))) {
    res.sendFile(join(distPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Meal Planner API running on port ${PORT}`);
});
