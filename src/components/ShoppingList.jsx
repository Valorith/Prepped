import React, { useState, useEffect } from 'react';
import { shoppingApi, mealsApi, withLoading } from '../utils/api.js';
import { useLoading, LoadingSpinner } from '../hooks/useLoading.jsx';

const GROCERY_AISLES = [
  { id: 'produce', name: 'Produce', icon: '🥬', color: '#27ae60' },
  { id: 'meat', name: 'Meat & Seafood', icon: '🥩', color: '#e74c3c' },
  { id: 'dairy', name: 'Dairy & Eggs', icon: '🧀', color: '#f39c12' },
  { id: 'deli', name: 'Deli', icon: '🥪', color: '#9b59b6' },
  { id: 'bakery', name: 'Bakery', icon: '🍞', color: '#e67e22' },
  { id: 'frozen', name: 'Frozen', icon: '🧊', color: '#3498db' },
  { id: 'pantry', name: 'Pantry & Canned', icon: '🥫', color: '#95a5a6' },
  { id: 'grains', name: 'Grains & Pasta', icon: '🌾', color: '#d35400' },
  { id: 'condiments', name: 'Condiments', icon: '🫙', color: '#8e44ad' },
  { id: 'spices', name: 'Spices', icon: '🧂', color: '#c0392b' },
  { id: 'beverages', name: 'Beverages', icon: '🥤', color: '#2980b9' },
  { id: 'snacks', name: 'Snacks', icon: '🍿', color: '#f39c12' },
  { id: 'health', name: 'Health & Personal', icon: '🧴', color: '#16a085' },
  { id: 'cleaning', name: 'Cleaning', icon: '🧽', color: '#7f8c8d' },
  { id: 'other', name: 'Other', icon: '📦', color: '#95a5a6' },
];

function formatQuantity(quantity, unit) {
  if (quantity <= 0) return '';
  
  const num = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  return unit ? `${num} ${unit}` : num;
}

function ShoppingItem({ item, onToggle, onDelete, onEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (editName.trim() && editName !== item.name) {
      await onEdit(item.id, { name: editName.trim() });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(item.name);
    setIsEditing(false);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-md)',
      padding: 'var(--spacing-md)',
      background: 'var(--bg-card)',
      border: `1px solid ${item.checked ? 'var(--secondary)' : 'var(--border-primary)'}`,
      borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--spacing-sm)',
      transition: 'var(--transition-fast)',
      opacity: item.checked ? 0.7 : 1
    }}>
      <input
        type="checkbox"
        checked={!!item.checked}
        onChange={() => onToggle(item.id, !!item.checked)}
        style={{
          accentColor: 'var(--secondary)',
          width: '18px',
          height: '18px',
          cursor: 'pointer'
        }}
      />
      
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input input-sm"
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-sm">
              ✓
            </button>
            <button type="button" onClick={handleCancelEdit} className="btn btn-ghost btn-sm">
              ✕
            </button>
          </form>
        ) : (
          <div
            style={{
              fontSize: 'var(--font-base)',
              color: item.checked ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: item.checked ? 'line-through' : 'none',
              cursor: 'pointer'
            }}
            onClick={() => setIsEditing(true)}
          >
            {item.name}
          </div>
        )}
        
        {(item.quantity > 0 || item.unit) && (
          <div style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            marginTop: 'var(--spacing-xs)'
          }}>
            {formatQuantity(item.quantity, item.unit)}
          </div>
        )}
      </div>
      
      <button
        onClick={() => onDelete(item.id)}
        className="btn btn-ghost btn-sm no-print"
        style={{
          color: 'var(--error)',
          fontSize: 'var(--font-lg)',
          minWidth: 'auto',
          padding: 'var(--spacing-xs)'
        }}
        title="Remove item"
      >
        🗑️
      </button>
    </div>
  );
}

function AisleSection({ aisle, items, onToggle, onDelete, onEdit, isExpanded, onToggleExpanded }) {
  if (items.length === 0) return null;

  const checkedCount = items.filter(item => item.checked).length;
  const totalCount = items.length;
  const allChecked = checkedCount === totalCount;

  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          padding: 'var(--spacing-md)',
          borderBottom: isExpanded ? '1px solid var(--border-primary)' : 'none',
          marginBottom: isExpanded ? 'var(--spacing-md)' : 0
        }}
        onClick={() => onToggleExpanded(aisle.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <div style={{
            fontSize: '24px',
            padding: 'var(--spacing-sm)',
            background: allChecked ? 'var(--secondary)' : aisle.color,
            borderRadius: '50%',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition-fast)'
          }}>
            {allChecked ? '✓' : aisle.icon}
          </div>
          
          <div>
            <h3 style={{
              fontSize: 'var(--font-lg)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0
            }}>
              {aisle.name}
            </h3>
            <div style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--text-muted)'
            }}>
              {checkedCount} of {totalCount} items
            </div>
          </div>
        </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          color: 'var(--text-muted)'
        }}>
          <div style={{ fontSize: 'var(--font-sm)' }}>
            {Math.round((checkedCount / totalCount) * 100)}%
          </div>
          <div style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'var(--transition-fast)',
            fontSize: '16px'
          }}>
            ▼
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div style={{ padding: '0 var(--spacing-md) var(--spacing-md)' }}>
          {items.map(item => (
            <ShoppingItem
              key={item.id}
              item={item}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('other');
  const [expandedAisles, setExpandedAisles] = useState(new Set(['produce', 'meat', 'dairy']));
  const [viewMode, setViewMode] = useState('aisles'); // aisles | simple
  const [showCompleted, setShowCompleted] = useState(true);
  const { isLoading } = useLoading();

  const loadItems = async () => {
    try {
      const data = await shoppingApi.getAll();
      setItems(data);
    } catch (error) {
      console.error('Failed to load shopping list:', error);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const addItem = async () => {
    if (!newItem.trim()) return;
    
    try {
      const created = await withLoading(
        () => shoppingApi.create({
          name: newItem.trim(),
          quantity: 1,
          unit: '',
          category: newItemCategory
        }),
        'add-item',
        { successMessage: 'Item added to shopping list!' }
      );
      
      setItems(prev => [...prev, created]);
      setNewItem('');
      
      // Auto-expand the aisle when adding an item
      setExpandedAisles(prev => new Set([...prev, newItemCategory]));
    } catch (error) {
      console.error('Failed to add item:', error);
    }
  };

  const toggleItem = async (id, isChecked) => {
    try {
      const updated = await shoppingApi.update(id, { checked: !isChecked });
      setItems(prev => prev.map(item => item.id === id ? updated : item));
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  };

  const editItem = async (id, updates) => {
    try {
      const updated = await shoppingApi.update(id, updates);
      setItems(prev => prev.map(item => item.id === id ? { ...item, ...updated } : item));
    } catch (error) {
      console.error('Failed to edit item:', error);
    }
  };

  const deleteItem = async (id) => {
    try {
      await shoppingApi.delete(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  const clearCompleted = async () => {
    if (!window.confirm('Remove all completed items from your shopping list?')) return;
    
    try {
      await withLoading(
        () => Promise.all(
          items.filter(item => item.checked).map(item => shoppingApi.delete(item.id))
        ),
        'clear-completed',
        { successMessage: 'Completed items removed!' }
      );
      
      setItems(prev => prev.filter(item => !item.checked));
    } catch (error) {
      console.error('Failed to clear completed items:', error);
    }
  };

  const generateFromMeals = async () => {
    try {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      const startDate = monday.toISOString().split('T')[0];
      const endDate = sunday.toISOString().split('T')[0];
      
      await withLoading(
        () => shoppingApi.generateFromMeals({
          start: startDate,
          end: endDate,
          clear_existing: false
        }),
        'generate-list',
        { successMessage: 'Shopping list generated from meal plan!' }
      );
      
      await loadItems(); // Reload the full list
    } catch (error) {
      console.error('Failed to generate shopping list:', error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleAisle = (aisleId) => {
    setExpandedAisles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(aisleId)) {
        newSet.delete(aisleId);
      } else {
        newSet.add(aisleId);
      }
      return newSet;
    });
  };

  // Group items by aisle
  const itemsByAisle = items.reduce((acc, item) => {
    const aisleId = item.aisle_id || item.category || 'other';
    if (!acc[aisleId]) acc[aisleId] = [];
    acc[aisleId].push(item);
    return acc;
  }, {});

  // Filter items based on view settings
  const displayItems = showCompleted ? items : items.filter(item => !item.checked);

  // Statistics
  const totalItems = items.length;
  const completedItems = items.filter(item => item.checked).length;
  const remainingItems = totalItems - completedItems;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="flex items-center gap-md">
          <LoadingSpinner size={24} />
          <span className="text-secondary">Loading shopping list...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="no-print" style={{
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
            Shopping List
          </h2>
          <p style={{
            color: 'var(--text-muted)',
            margin: 0,
            fontSize: 'var(--font-base)'
          }}>
            {remainingItems} of {totalItems} items remaining
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setViewMode(viewMode === 'aisles' ? 'simple' : 'aisles')}
            className={viewMode === 'aisles' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            title="Toggle view mode"
          >
            {viewMode === 'aisles' ? '📋' : '🏪'} {viewMode === 'aisles' ? 'Simple' : 'Aisles'}
          </button>
          
          <button
            onClick={handlePrint}
            className="btn btn-outline btn-sm"
            title="Print shopping list"
          >
            🖨️ Print
          </button>
          
          <button
            onClick={generateFromMeals}
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
            title="Generate from this week's meal plan"
          >
            🛒 Generate
          </button>
          
          {completedItems > 0 && (
            <button
              onClick={clearCompleted}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--error)' }}
              title="Remove completed items"
            >
              🗑️ Clear Done
            </button>
          )}
        </div>
      </div>

      {/* Add Item Form */}
      <div className="card mb-xl no-print">
        <form onSubmit={(e) => { e.preventDefault(); addItem(); }} style={{
          display: 'flex',
          gap: 'var(--spacing-md)',
          alignItems: 'end',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label className="label">Add Item</label>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              className="input"
              placeholder="Enter item name..."
              style={{ marginBottom: 0 }}
            />
          </div>
          
          <div style={{ minWidth: '150px' }}>
            <label className="label">Aisle</label>
            <select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              className="input select"
              style={{ marginBottom: 0 }}
            >
              {GROCERY_AISLES.map(aisle => (
                <option key={aisle.id} value={aisle.id}>
                  {aisle.icon} {aisle.name}
                </option>
              ))}
            </select>
          </div>
          
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newItem.trim() || isLoading}
          >
            + Add
          </button>
        </form>
      </div>

      {/* View Controls */}
      {totalItems > 0 && (
        <div className="no-print" style={{
          display: 'flex',
          gap: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-xl)',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)'
          }}>
            <input
              type="checkbox"
              id="show-completed"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            <label htmlFor="show-completed" className="label" style={{ margin: 0 }}>
              Show completed items ({completedItems})
            </label>
          </div>

          {viewMode === 'aisles' && (
            <>
              <div style={{ height: '1px', background: 'var(--border-primary)', flex: 1, minWidth: '20px' }} />
              
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                <button
                  onClick={() => {
                    const allAisleIds = GROCERY_AISLES.map(aisle => aisle.id);
                    setExpandedAisles(new Set(allAisleIds));
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Expand All
                </button>
                <button
                  onClick={() => setExpandedAisles(new Set())}
                  className="btn btn-ghost btn-sm"
                >
                  Collapse All
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Shopping List Content */}
      {totalItems === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛒</div>
          <h3 className="empty-state-title">Your shopping list is empty</h3>
          <p className="empty-state-description">
            Add items manually or generate a list from your weekly meal plan
          </p>
          <button onClick={generateFromMeals} className="btn btn-primary">
            Generate from Meal Plan
          </button>
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div className="print-friendly" style={{
            marginBottom: 'var(--spacing-xl)',
            padding: 'var(--spacing-lg)',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--spacing-sm)'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: 'var(--font-lg)',
                color: 'var(--text-primary)'
              }}>
                Shopping Progress
              </h3>
              <span style={{
                fontSize: 'var(--font-lg)',
                fontWeight: 600,
                color: completedItems === totalItems ? 'var(--secondary)' : 'var(--text-primary)'
              }}>
                {completedItems}/{totalItems}
              </span>
            </div>
            
            <div style={{
              height: '8px',
              background: 'var(--bg-tertiary)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${(completedItems / totalItems) * 100}%`,
                background: 'var(--secondary)',
                transition: 'var(--transition-normal)'
              }} />
            </div>
          </div>

          {/* Items Display */}
          {viewMode === 'aisles' ? (
            // Aisle view
            <div>
              {GROCERY_AISLES.map(aisle => {
                const aisleItems = itemsByAisle[aisle.id] || [];
                const filteredAisleItems = showCompleted ? aisleItems : aisleItems.filter(item => !item.checked);
                
                return (
                  <AisleSection
                    key={aisle.id}
                    aisle={aisle}
                    items={filteredAisleItems}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                    onEdit={editItem}
                    isExpanded={expandedAisles.has(aisle.id)}
                    onToggleExpanded={toggleAisle}
                  />
                );
              })}
            </div>
          ) : (
            // Simple list view
            <div className="card">
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-sm)'
              }}>
                {displayItems.map(item => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                    onEdit={editItem}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          * {
            color: black !important;
            background: white !important;
          }
          
          .card {
            border: 1px solid #ccc !important;
            box-shadow: none !important;
            break-inside: avoid;
            margin-bottom: 1rem !important;
          }
          
          h2, h3 {
            color: black !important;
          }
          
          .btn, button {
            display: none !important;
          }
          
          .no-print {
            display: none !important;
          }
          
          .print-friendly {
            background: white !important;
            color: black !important;
            border: 1px solid #ccc !important;
          }
          
          input[type="checkbox"] {
            -webkit-appearance: checkbox;
            appearance: checkbox;
          }
        }
      `}</style>
    </div>
  );
}