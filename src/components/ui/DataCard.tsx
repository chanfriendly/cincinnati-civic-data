import React, { useState } from 'react'
import LoadingSkeleton from './LoadingSkeleton'
import ErrorState from './ErrorState'
import DataAttribution from './DataAttribution'

interface DataCardProps {
  title: string
  count?: number | string
  status?: 'ok' | 'warning' | 'error'
  children: React.ReactNode
  expandable?: boolean
  defaultExpanded?: boolean
  attribution?: {
    datasetName: string
    lastUpdated: string | null
    uid?: string
  }
  // Convenience state props — DataCard handles the loading/error UI automatically
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  empty?: boolean
  className?: string
}

const ChevronIcon: React.FC<{ isOpen: boolean; className?: string }> = ({
  isOpen,
  className = 'w-5 h-5',
}) => (
  <svg
    className={`${className} transition-transform ${isOpen ? 'rotate-180' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const StatusDot: React.FC<{ status?: 'ok' | 'warning' | 'error' }> = ({ status }) => {
  if (!status) return null
  const colors = { ok: 'bg-green-500', warning: 'bg-yellow-500', error: 'bg-red-500' }
  return <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors[status]}`} />
}

const DataCard: React.FC<DataCardProps> = ({
  title,
  count,
  status,
  children,
  expandable = false,
  defaultExpanded = true,
  attribution,
  loading = false,
  error = null,
  onRetry,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const bodyContent = loading ? (
    <LoadingSkeleton lines={3} />
  ) : error ? (
    <ErrorState message={error} onRetry={onRetry} />
  ) : (
    children
  )

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
      {/* Header */}
      <div
        className={`flex items-center justify-between ${expandable ? 'cursor-pointer select-none' : ''}`}
        onClick={expandable ? () => setIsExpanded((v) => !v) : undefined}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusDot status={status} />
          <h3 className="text-base font-bold text-[#1A4A6B] truncate">{title}</h3>
          {count !== undefined && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 flex-shrink-0">
              {count}
            </span>
          )}
        </div>
        {expandable && <ChevronIcon isOpen={isExpanded} />}
      </div>

      {/* Body */}
      {(!expandable || isExpanded) && (
        <div className="mt-4 text-gray-700">{bodyContent}</div>
      )}

      {/* Attribution — show below body */}
      {attribution && (!expandable || isExpanded) && (
        <DataAttribution {...attribution} />
      )}
    </div>
  )
}

export default DataCard
