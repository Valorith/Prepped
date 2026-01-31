import pkg from 'pg';
const { Pool } = pkg;
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create PostgreSQL connection pool
function createPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return null;
}

// SQLite fallback for local development
function createSQLiteDB() {
  const db = new Database(join(__dirname, 'meal-planner.db'), { wal: true });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// Database migrations for enhanced meal planner
export async function runMigrations() {
  const pool = createPool();
  
  if (!pool) {
    console.log('No DATABASE_URL found, using SQLite fallback for development');
    const db = createSQLiteDB();
    runSQLiteMigrations(db);
    db.close();
    return;
  }

  try {
    console.log('Running PostgreSQL migrations...');
    
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Get current version
    const result = await pool.query('SELECT COALESCE(MAX(version), 0) as version FROM migrations');
    const currentVersion = result.rows[0].version;
    
    console.log(`Current schema version: ${currentVersion}`);
    
    if (currentVersion < 1) {
      console.log('Running migration 1: Create initial tables');
      await pool.query(`
        -- Create recipes table
        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          servings INTEGER DEFAULT 4,
          prep_time INTEGER DEFAULT 0,
          cook_time INTEGER DEFAULT 0,
          instructions TEXT DEFAULT '',
          tags TEXT DEFAULT '[]',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          calories INTEGER DEFAULT 0,
          protein REAL DEFAULT 0,
          carbs REAL DEFAULT 0,
          fat REAL DEFAULT 0,
          rating REAL DEFAULT 0,
          rating_count INTEGER DEFAULT 0,
          is_favorite BOOLEAN DEFAULT FALSE,
          difficulty TEXT DEFAULT 'medium',
          cuisine_type TEXT DEFAULT '',
          recipe_type TEXT DEFAULT 'dinner',
          source_url TEXT DEFAULT '',
          image_url TEXT DEFAULT ''
        );

        -- Create ingredients table
        CREATE TABLE IF NOT EXISTS ingredients (
          id TEXT PRIMARY KEY,
          recipe_id TEXT NOT NULL,
          name TEXT NOT NULL,
          quantity REAL DEFAULT 1,
          unit TEXT DEFAULT '',
          category TEXT DEFAULT 'other',
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        );

        -- Create meal_plan table
        CREATE TABLE IF NOT EXISTS meal_plan (
          id TEXT PRIMARY KEY,
          recipe_id TEXT,
          date DATE NOT NULL,
          meal_type TEXT NOT NULL DEFAULT 'dinner',
          notes TEXT DEFAULT '',
          custom_name TEXT DEFAULT '',
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
        );

        -- Create shopping_list table
        CREATE TABLE IF NOT EXISTS shopping_list (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          quantity REAL DEFAULT 1,
          unit TEXT DEFAULT '',
          category TEXT DEFAULT 'other',
          checked BOOLEAN DEFAULT FALSE,
          week_of TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          aisle_id TEXT DEFAULT 'other'
        );

        -- Create meal_templates table
        CREATE TABLE IF NOT EXISTS meal_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          template_data TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- Create recipe_ratings table
        CREATE TABLE IF NOT EXISTS recipe_ratings (
          id TEXT PRIMARY KEY,
          recipe_id TEXT NOT NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        );

        -- Create grocery_aisles table
        CREATE TABLE IF NOT EXISTS grocery_aisles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER DEFAULT 0,
          icon TEXT DEFAULT '📦'
        );

        -- Insert default grocery aisles
        INSERT INTO grocery_aisles (id, name, sort_order, icon) VALUES
          ('produce', 'Produce', 1, '🥬'),
          ('meat', 'Meat & Seafood', 2, '🥩'),
          ('dairy', 'Dairy & Eggs', 3, '🧀'),
          ('deli', 'Deli', 4, '🥪'),
          ('bakery', 'Bakery', 5, '🍞'),
          ('frozen', 'Frozen', 6, '🧊'),
          ('pantry', 'Pantry & Dry Goods', 7, '🥫'),
          ('grains', 'Grains & Pasta', 8, '🌾'),
          ('condiments', 'Condiments & Sauces', 9, '🫙'),
          ('spices', 'Spices & Seasonings', 10, '🧂'),
          ('beverages', 'Beverages', 11, '🥤'),
          ('snacks', 'Snacks', 12, '🍿'),
          ('health', 'Health & Personal Care', 13, '🧴'),
          ('cleaning', 'Cleaning & Household', 14, '🧽'),
          ('other', 'Other', 15, '📦')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO migrations (version) VALUES (1);
      `);
    }
    
    if (currentVersion < 2) {
      console.log('Running migration 2: Add import_source to recipes');
      await pool.query(`
        ALTER TABLE recipes ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT '';
        INSERT INTO migrations (version) VALUES (2);
      `);
    }
    
    console.log('PostgreSQL migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// SQLite migrations for local development
function runSQLiteMigrations(db) {
  // Check if we need to run migrations
  const getUserVersion = db.prepare('PRAGMA user_version').pluck();
  const currentVersion = getUserVersion.get();
  
  console.log(`Current SQLite schema version: ${currentVersion}`);
  
  if (currentVersion < 1) {
    console.log('Running migration 1: Add nutritional info and ratings to recipes');
    db.exec(`
      -- Add nutritional info and rating columns to recipes
      ALTER TABLE recipes ADD COLUMN calories INTEGER DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN protein REAL DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN carbs REAL DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN fat REAL DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN rating REAL DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN rating_count INTEGER DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN is_favorite INTEGER DEFAULT 0;
      ALTER TABLE recipes ADD COLUMN difficulty TEXT DEFAULT 'medium';
      ALTER TABLE recipes ADD COLUMN cuisine_type TEXT DEFAULT '';
      ALTER TABLE recipes ADD COLUMN recipe_type TEXT DEFAULT 'dinner';
      
      PRAGMA user_version = 1;
    `);
  }
  
  if (currentVersion < 2) {
    console.log('Running migration 2: Create meal plan templates table');
    db.exec(`
      CREATE TABLE IF NOT EXISTS meal_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        template_data TEXT NOT NULL, -- JSON of the weekly meal plan
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      PRAGMA user_version = 2;
    `);
  }
  
  if (currentVersion < 3) {
    console.log('Running migration 3: Add URL and source fields for recipe import');
    db.exec(`
      ALTER TABLE recipes ADD COLUMN source_url TEXT DEFAULT '';
      ALTER TABLE recipes ADD COLUMN image_url TEXT DEFAULT '';
      
      PRAGMA user_version = 3;
    `);
  }
  
  if (currentVersion < 4) {
    console.log('Running migration 4: Create recipe ratings table');
    db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_ratings (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
      );
      
      PRAGMA user_version = 4;
    `);
  }
  
  if (currentVersion < 5) {
    console.log('Running migration 5: Add grocery aisle organization');
    db.exec(`
      CREATE TABLE IF NOT EXISTS grocery_aisles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER DEFAULT 0,
        icon TEXT DEFAULT '📦'
      );
      
      -- Insert default grocery aisles
      INSERT OR IGNORE INTO grocery_aisles (id, name, sort_order, icon) VALUES
        ('produce', 'Produce', 1, '🥬'),
        ('meat', 'Meat & Seafood', 2, '🥩'),
        ('dairy', 'Dairy & Eggs', 3, '🧀'),
        ('deli', 'Deli', 4, '🥪'),
        ('bakery', 'Bakery', 5, '🍞'),
        ('frozen', 'Frozen', 6, '🧊'),
        ('pantry', 'Pantry & Dry Goods', 7, '🥫'),
        ('grains', 'Grains & Pasta', 8, '🌾'),
        ('condiments', 'Condiments & Sauces', 9, '🫙'),
        ('spices', 'Spices & Seasonings', 10, '🧂'),
        ('beverages', 'Beverages', 11, '🥤'),
        ('snacks', 'Snacks', 12, '🍿'),
        ('health', 'Health & Personal Care', 13, '🧴'),
        ('cleaning', 'Cleaning & Household', 14, '🧽'),
        ('other', 'Other', 15, '📦');
      
      -- Update shopping_list to reference aisles
      ALTER TABLE shopping_list ADD COLUMN aisle_id TEXT DEFAULT 'other';
      
      PRAGMA user_version = 5;
    `);
  }
  
  if (currentVersion < 6) {
    console.log('Running migration 6: Add import_source to recipes');
    db.exec(`
      ALTER TABLE recipes ADD COLUMN import_source TEXT DEFAULT '';
      
      PRAGMA user_version = 6;
    `);
  }
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}