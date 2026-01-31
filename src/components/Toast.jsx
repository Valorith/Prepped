import React, { useEffect, useState } from 'react'

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onClose, 300) // Wait for animation
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const getIcon = () => {
    switch (type) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'warning': return '⚠️'
      default: return 'ℹ️'
    }
  }

  const getTypeClass = () => {
    switch (type) {
      case 'success': return 'toast success'
      case 'error': return 'toast error'
      case 'warning': return 'toast warning'
      default: return 'toast'
    }
  }

  return (
    <div 
      className={getTypeClass()}
      style={{
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}
    >
      <span style={{ fontSize: 16 }}>{getIcon()}</span>
      <div style={{ flex: 1, fontSize: 14 }}>{message}</div>
      <button
        onClick={() => {
          setIsVisible(false)
          setTimeout(onClose, 300)
        }}
        className="btn-ghost btn-sm"
        style={{
          padding: '4px',
          minHeight: 'auto',
          color: type === 'warning' ? 'var(--bg-primary)' : 'currentColor'
        }}
      >
        ×
      </button>
    </div>
  )
}

export default Toast