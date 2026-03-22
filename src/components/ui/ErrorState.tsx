import React from 'react'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

const ErrorIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
    <line x1="12" y1="8" x2="12" y2="12" strokeWidth={2} strokeLinecap="round" />
    <circle cx="12" cy="16" r="0.5" fill="currentColor" />
  </svg>
)

const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'The city data API is temporarily unavailable.',
  onRetry,
}) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <ErrorIcon />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium mb-3">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ErrorState
