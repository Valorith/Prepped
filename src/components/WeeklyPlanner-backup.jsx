import React, { useState, useEffect } from 'react';
import { mealsApi, recipesApi, withLoading } from '../utils/api.js';
import { useLoading, LoadingSpinner } from '../hooks/useLoading.jsx';
import MealModal from './MealModal.jsx';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', icon: '🌅', color: '#f39c12' },
  { value: 'lunch', label: 'Lunch', icon: '🥗', color: '#27ae60' },
  { value: 'dinner', label: 'Dinner', icon: '🍽️', color: '#e94560' },
  { value: 'snack', label: 'Snack', icon: '🍿', color: '#9b59b6' },
];

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDates(offset = 0) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
  
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date.toISOString().split('T')[0];
  });
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en', { month: 'short' }),
    isToday: dateStr === new Date().toISOString().split('T')[0]
  };
}

function MealCard({ meal, onEdit, onDelete, recipes }) {
  const mealType = MEAL_TYPES.find(t => t.value === meal.meal_type);
  const recipe = recipes.find(r => r.id === meal.recipe_id);
  
  return (
    <div
      className="card"
      style={{
        padding: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-sm)',
        borderLeft: `3px solid ${mealType?.color || 'var(--text-muted)'}`,
        cursor: 'pointer',
        position: 'relative'
      }}
      onClick={onEdit}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'start',
        gap: 'var(--spacing-sm)'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 'var(--spacing-xs)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {meal.recipe_name || meal.custom_name || 'Untitled'}
          </div>
          
          <div style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)'
          }}>
            <span>{mealType?.icon}</span>
            <span>{mealType?.label}</span>
            {recipe && recipe.total_time > 0 && (
              <>
                <span>•</span>
                <span>⏱️ {recipe.total_time}m</span>
              </>
            )}
          </div>
          
          {meal.notes && (
            <div style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--text-secondary)',
              marginTop: 'var(--spacing-xs)',
              fontStyle: 'italic'
            }}>
              {meal.notes}
            </div>
          )}
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="btn-ghost"
          style={{
            padding: '2px',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            minWidth: 'auto',
            lineHeight: 1
          }}
          title="Remove meal"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function DayColumn({ date, meals, onAddMeal, onEditMeal, onDeleteMeal, recipes }) {
  const { day, month, isToday } = formatDate(date);
  const dayIndex = new Date(date + 'T12:00:00').getDay();
  const dayName = DAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];
  const shortName = DAY_SHORT[dayIndex === 0 ? 6 : dayIndex - 1];
  
  const dayMeals = meals.filter(m => m.date === date);
  const mealsByType = MEAL_TYPES.reduce((acc, type) => {
    acc[type.value] = dayMeals.filter(m => m.meal_type === type.value);
    return acc;
  }, {});

  return (
    <div
      className="card"
      style={{
        minHeight: '400px',
        borderColor: isToday ? 'var(--primary)' : 'var(--border-primary)',
        boxShadow: isToday ? 'var(--shadow-md)' : 'none'
      }}
    >
      {/* Day Header */}
      <div style={{
        marginBottom: 'var(--spacing-lg)',
        textAlign: 'center',
        paddingBottom: 'var(--spacing-md)',
        borderBottom: '1px solid var(--border-primary)'
      }}>
        <div style={{
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
          marginBottom: 'var(--spacing-xs)',
          display: 'none'
        }} className="day-full">
          {dayName}
        </div>
        <div style={{
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
          marginBottom: 'var(--spacing-xs)'
        }} className="day-short">
          {shortName}
        </div>
        <div style={{
          fontSize: 'var(--font-xl)',
          fontWeight: 700,
          color: isToday ? 'var(--primary)' : 'var(--text-primary)'
        }}>
          {day}
        </div>
        <div style={{
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)'
        }}>
          {month}
        </div>
        {isToday && (
          <div style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--primary)',
            fontWeight: 600,
            marginTop: 'var(--spacing-xs)'
          }}>
            Today
          </div>
        )}
      </div>

      {/* Meals by Type */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {MEAL_TYPES.map(mealType => {
          const typeMeals = mealsByType[mealType.value];
          
          return (
            <div key={mealType.value}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-sm)'
              }}>
                <div style={{
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)'
                }}>
                  <span>{mealType.icon}</span>
                  <span className="meal-type-label">{mealType.label}</span>
                </div>
                
                <button
                  onClick={() => onAddMeal(date, mealType.value)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: 'var(--font-xs)',
                    padding: '2px 6px',
                    minWidth: 'auto'
                  }}
                  title={`Add ${mealType.label.toLowerCase()}`}
                >
                  +
                </button>
              </div>
              
              <div>
                {typeMeals.length > 0 ? (
                  typeMeals.map(meal => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      onEdit={() => onEditMeal(meal)}
                      onDelete={() => onDeleteMeal(meal.id)}
                      recipes={recipes}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      padding: 'var(--spacing-sm)',
                      border: '1px dashed var(--border-primary)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--font-xs)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onClick={() => onAddMeal(date, mealType.value)}
                  >
                    No {mealType.label.toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WeeklyPlanner() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [meals, setMeals] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMealData, setNewMealData] = useState(null);
  const { isLoading } = useLoading();
  
  const dates = getWeekDates(weekOffset);
  const startDate = dates[0];
  const endDate = dates[6];

  const loadData = async () => {
    try {
      const [mealsData, recipesData] = await Promise.all([
        withLoading(() => mealsApi.getAll({ start: startDate, end: endDate }), 'load-meals'),
        withLoading(() => recipesApi.getAll(), 'load-recipes')
      ]);
      
      setMeals(mealsData);
      setRecipes(recipesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const handleAddMeal = (date, mealType) => {
    setSelectedMeal(null);
    setNewMealData({ date, meal_type: mealType });
    setIsModalOpen(true);
  };

  const handleEditMeal = (meal) => {
    setSelectedMeal(meal);
    setNewMealData(null);
    setIsModalOpen(true);
  };

  const handleSaveMeal = async (mealData) => {
    try {
      let savedMeal;
      if (selectedMeal) {
        savedMeal = await withLoading(
          () => mealsApi.update(selectedMeal.id, mealData),
          'update-meal',
          { successMessage: 'Meal updated successfully!' }
        );
        setMeals(prev => prev.map(m => m.id === selectedMeal.id ? savedMeal : m));
      } else {
        savedMeal = await withLoading(
          () => mealsApi.create({ ...newMealData, ...mealData }),
          'create-meal',
          { successMessage: 'Meal added successfully!' }
        );
        setMeals(prev => [...prev, savedMeal]);
      }
      
      setIsModalOpen(false);
      setSelectedMeal(null);
      setNewMealData(null);
    } catch (error) {
      console.error('Failed to save meal:', error);
    }
  };

  const handleDeleteMeal = async (id) => {
    if (window.confirm('Are you sure you want to remove this meal?')) {
      try {
        await withLoading(
          () => mealsApi.delete(id),
          'delete-meal',
          { successMessage: 'Meal removed successfully!' }
        );
        setMeals(prev => prev.filter(m => m.id !== id));
      } catch (error) {
        console.error('Failed to delete meal:', error);
      }
    }
  };

  const getWeekLabel = () => {
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    const startMonth = start.toLocaleDateString('en', { month: 'short' });
    const endMonth = end.toLocaleDateString('en', { month: 'short' });
    
    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    } else {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
    }
  };

  const getTotalMeals = () => meals.length;
  const getPlannedDays = () => new Set(meals.map(m => m.date)).size;

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
            Weekly Meal Plan
          </h2>
          <p style={{
            color: 'var(--text-muted)',
            margin: 0,
            fontSize: 'var(--font-base)'
          }}>
            {getTotalMeals()} meal{getTotalMeals() !== 1 ? 's' : ''} planned • {getPlannedDays()} day{getPlannedDays() !== 1 ? 's' : ''} with meals
          </p>
        </div>

        {/* Week Navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-md)',
          background: 'var(--bg-card)',
          padding: 'var(--spacing-sm)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)'
        }}>
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="btn btn-ghost btn-sm"
            disabled={isLoading}
          >
            ← Prev
          </button>
          
          <div style={{
            textAlign: 'center',
            minWidth: '200px'
          }}>
            <div style={{
              fontSize: 'var(--font-lg)',
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}>
              {getWeekLabel()}
            </div>
            {weekOffset === 0 && (
              <div style={{
                fontSize: 'var(--font-xs)',
                color: 'var(--primary)',
                fontWeight: 500
              }}>
                This Week
              </div>
            )}
          </div>
          
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="btn btn-ghost btn-sm"
            disabled={isLoading}
          >
            Next →
          </button>
          
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="btn btn-primary btn-sm"
              disabled={isLoading}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
          <div className="flex items-center gap-md">
            <LoadingSpinner size={24} />
            <span className="text-secondary">Loading meal plan...</span>
          </div>
        </div>
      )}

      {/* Week Grid */}
      {!isLoading && (
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--spacing-lg)'
          }}
        >
          {dates.map(date => (
            <DayColumn
              key={date}
              date={date}
              meals={meals}
              recipes={recipes}
              onAddMeal={handleAddMeal}
              onEditMeal={handleEditMeal}
              onDeleteMeal={handleDeleteMeal}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && meals.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3 className="empty-state-title">No meals planned this week</h3>
          <p className="empty-state-description">
            Start planning your week by adding meals to each day.
            Click the "+" button next to any meal type to get started.
          </p>
        </div>
      )}

      {/* Meal Modal */}
      {isModalOpen && (
        <MealModal
          meal={selectedMeal}
          newMealData={newMealData}
          recipes={recipes}
          onSave={handleSaveMeal}
          onCancel={() => {
            setIsModalOpen(false);
            setSelectedMeal(null);
            setNewMealData(null);
          }}
        />
      )}

      {/* Responsive Styles */}
      <style jsx>{`
        @media (min-width: 769px) {
          .day-full {
            display: block !important;
          }
          .day-short {
            display: none !important;
          }
          .meal-type-label {
            display: inline !important;
          }
        }
        
        @media (max-width: 768px) {
          .meal-type-label {
            display: none;
          }
        }
        
        @media (max-width: 640px) {
          .grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}