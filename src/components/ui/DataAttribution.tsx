import React from 'react'
import { formatDate } from '../../utils/api'

interface DataAttributionProps {
  datasetName?: string   // primary prop
  source?: string        // alias — tabs use this interchangeably
  lastUpdated?: string | null
  uid?: string
}

const DataAttribution: React.FC<DataAttributionProps> = ({
  datasetName,
  source,
  lastUpdated,
  uid,
}) => {
  const label = datasetName ?? source ?? 'Cincinnati Open Data Portal'
  const formattedDate = lastUpdated ? formatDate(lastUpdated) : null
  const portalLink = uid
    ? `https://data.cincinnati-oh.gov/resource/${uid}`
    : 'https://data.cincinnati-oh.gov'

  return (
    <p className="text-xs text-gray-400 italic mt-3 pt-2 border-t border-gray-100">
      Source:{' '}
      <a
        href={portalLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#1A4A6B] hover:underline"
      >
        {label}
      </a>
      {formattedDate && ` — Updated ${formattedDate}`}
    </p>
  )
}

export default DataAttribution
