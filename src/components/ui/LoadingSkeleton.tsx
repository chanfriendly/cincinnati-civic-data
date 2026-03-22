import React from 'react'

interface LoadingSkeletonProps {
  lines?: number
  height?: string
  className?: string
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  lines = 3,
  height = 'h-4',
  className = '',
}) => {
  const widths = ['w-full', 'w-5/6', 'w-4/5']

  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className={`${height} ${widths[idx % widths.length]} bg-gray-200 rounded skeleton`}
        />
      ))}
    </div>
  )
}

export default LoadingSkeleton
