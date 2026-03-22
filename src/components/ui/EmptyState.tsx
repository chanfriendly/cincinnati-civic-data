import React from 'react'

interface EmptyStateProps {
  message: string
  icon?: React.ReactNode
}

const DefaultIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
    <line x1="9" y1="12" x2="15" y2="12" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const EmptyState: React.FC<EmptyStateProps> = ({ message, icon }) => {
  return (
    <div className="text-center py-6">
      <div className="flex justify-center mb-3 text-gray-400">
        {icon || <DefaultIcon />}
      </div>
      <p className="text-gray-500 text-sm italic">{message}</p>
    </div>
  )
}

export default EmptyState
