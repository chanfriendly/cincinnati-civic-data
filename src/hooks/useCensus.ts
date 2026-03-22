import { useState, useEffect, useCallback } from 'react';
import { fetchCensus } from '../utils/api';

export type CensusStatus = 'idle' | 'loading' | 'success' | 'error';

export interface CensusResult {
  data: Record<string, string>[];
  status: CensusStatus;
  error: string | null;
}

/**
 * Hook for querying the Census ACS 5-year API via the proxy Worker.
 * year: e.g. 2022
 * variables: e.g. ['B25070_001E', 'B19013_001E', 'NAME']
 * forClause: e.g. 'tract:*'
 * inClause: e.g. 'state:39 county:061'  (Ohio=39, Hamilton=061)
 */
export function useCensus(
  year: number,
  variables: string[],
  forClause: string,
  inClause?: string,
  skip = false
): CensusResult {
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [status, setStatus] = useState<CensusStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    if (skip || variables.length === 0) return;
    setStatus('loading');
    try {
      const result = await fetchCensus(year, variables, forClause, inClause);
      setData(result);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Census fetch failed');
      setStatus('error');
    }
  }, [year, variables.join(','), forClause, inClause, skip]);

  useEffect(() => { doFetch(); }, [doFetch]);

  return { data, status, error };
}
