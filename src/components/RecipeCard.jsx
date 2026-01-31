import React from 'react';
import { useLoading } from '../hooks/useLoading.jsx';

const getDifficultyColor = (difficulty) => {
  switch (difficulty) {
    case 'easy': return 'var(--secondary)';
    case 'medium': return 'var(--warning)';
    case 'hard': return 'var(--error)';
    default: return 'var(--text-muted)';
  }
};

const formatTime = (minutes) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export default function RecipeCard({ recipe, viewMode, onEdit, onDelete, onToggleFavorite }) {
  const { isLoading } = useLoading();
  
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  
  if (viewMode === 'list') {
    return (
      <div className="card" style={{
        padding: 'var(--spacing-lg)',
        display: 'flex',
        gap: 'var(--spacing-lg)',
        alignItems: 'center'
      }}>
        {/* Recipe Image Placeholder */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: 'var(--radius-md)',
          background: recipe.image_url 
            ? `url(${recipe.image_url}) center/cover`
            : 'linear-gradient(135deg, var(--bg-tertiary), var(--border-primary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          flexShrink: 0
        }}>
          {!recipe.image_url && '🍽️'}
        </div>
        
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            <h3 style={{
              fontSize: 'var(--font-lg)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1
            }}>
              {recipe.name}
            </h3>
            
            {recipe.is_favorite && (
              <span style={{ color: 'var(--warning)' }} title="Favorite">❤️</span>
            )}
            
            <div className="badge" style={{ 
              backgroundColor: getDifficultyColor(recipe.difficulty),
              color: 'white'
            }}>
              {recipe.difficulty || 'medium'}
            </div>
          </div>
          
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-sm)',
            margin: 0,
            marginBottom: 'var(--spacing-sm)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {recipe.description || 'No description'}
          </p>
          
          <div style={{
            display: 'flex',
            gap: 'var(--spacing-lg)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)'
          }}>
            {totalTime > 0 && (
              <span className="badge">
                ⏱️ {formatTime(totalTime)}
              </span>
            )}
            <span className="badge">
              👥 {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
            </span>
            <span className="badge">
              🧾 {recipe.ingredients?.length || 0} ingredients
            </span>
            {recipe.rating > 0 && (
              <span className="badge">
                ⭐ {recipe.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        
        {/* Tags */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-xs)',
          maxWidth: '200px'
        }}>
          {recipe.tags?.slice(0, 3).map((tag, i) => (
            <span key={i} className="tag tag-primary">
              {tag}
            </span>
          ))}
          {recipe.tags?.length > 3 && (
            <span className="tag">
              +{recipe.tags.length - 3}
            </span>
          )}
        </div>
        
        {/* Actions */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-xs)'
        }}>
          <button
            onClick={onEdit}
            className="btn btn-outline btn-sm"
            disabled={isLoading}
            style={{ minWidth: '80px' }}
          >
            Edit
          </button>
          <button
            onClick={onToggleFavorite}
            className={recipe.is_favorite ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}
            disabled={isLoading}
            style={{ minWidth: '80px' }}
          >
            {recipe.is_favorite ? '❤️' : '🤍'}
          </button>
          <button
            onClick={onDelete}
            className="btn btn-ghost btn-sm"
            disabled={isLoading}
            style={{ color: 'var(--error)', minWidth: '80px' }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }
  
  // Grid view (default)
  return (
    <div className="card" style={{
      position: 'relative',
      overflow: 'hidden',
      transition: 'var(--transition-normal)'
    }}>
      {/* Recipe Image */}
      <div style={{
        height: '200px',
        background: recipe.image_url 
          ? `url(${recipe.image_url}) center/cover`
          : 'linear-gradient(135deg, var(--bg-tertiary), var(--border-primary))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
        marginBottom: 'var(--spacing-lg)',
        borderRadius: 'var(--radius-md)',
        position: 'relative'
      }}>
        {!recipe.image_url && '🍽️'}
        
        {/* Favorite Badge */}
        {recipe.is_favorite && (
          <div style={{
            position: 'absolute',
            top: 'var(--spacing-sm)',
            right: 'var(--spacing-sm)',
            background: 'rgba(0, 0, 0, 0.7)',
            borderRadius: '50%',
            padding: 'var(--spacing-xs)',
            fontSize: '16px'
          }}>
            ❤️
          </div>
        )}
        
        {/* Difficulty Badge */}
        <div style={{
          position: 'absolute',
          top: 'var(--spacing-sm)',
          left: 'var(--spacing-sm)',
          background: getDifficultyColor(recipe.difficulty),
          color: 'white',
          padding: 'var(--spacing-xs) var(--spacing-sm)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-xs)',
          fontWeight: 600,
          textTransform: 'uppercase'
        }}>
          {recipe.difficulty || 'medium'}
        </div>
      </div>
      
      {/* Recipe Info */}
      <div>
        <h3 style={{
          fontSize: 'var(--font-lg)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          marginBottom: 'var(--spacing-sm)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {recipe.name}
        </h3>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-sm)',
          margin: 0,
          marginBottom: 'var(--spacing-md)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          minHeight: '2.4em'
        }}>
          {recipe.description || 'No description'}
        </p>
        
        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-sm)',
          marginBottom: 'var(--spacing-lg)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)'
        }}>
          {totalTime > 0 && (
            <div className="badge">
              ⏱️ {formatTime(totalTime)}
            </div>
          )}
          <div className="badge">
            👥 {recipe.servings}
          </div>
          <div className="badge">
            🧾 {recipe.ingredients?.length || 0}
          </div>
          {recipe.rating > 0 && (
            <div className="badge">
              ⭐ {recipe.rating.toFixed(1)}
            </div>
          )}
        </div>
        
        {/* Tags */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-xs)',
          marginBottom: 'var(--spacing-lg)',
          minHeight: '20px'
        }}>
          {recipe.tags?.slice(0, 4).map((tag, i) => (
            <span key={i} className="tag tag-primary">
              {tag}
            </span>
          ))}
          {recipe.tags?.length > 4 && (
            <span className="tag">
              +{recipe.tags.length - 4}
            </span>
          )}
        </div>
        
        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 'var(--spacing-sm)'
        }}>
          <button
            onClick={onEdit}
            className="btn btn-outline btn-sm"
            disabled={isLoading}
            style={{ flex: 1 }}
          >
            Edit
          </button>
          <button
            onClick={onToggleFavorite}
            className={recipe.is_favorite ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}
            disabled={isLoading}
            title={recipe.is_favorite ? "Remove from favorites" : "Add to favorites"}
          >
            {recipe.is_favorite ? '❤️' : '🤍'}
          </button>
          <button
            onClick={onDelete}
            className="btn btn-ghost btn-sm"
            disabled={isLoading}
            style={{ color: 'var(--error)' }}
            title="Delete recipe"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}