import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSODA } from '../utils/api';
import type { SODAQueryParams } from '../types';

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SODAResult<T> {
  data: T[];
  status: FetchStatus;
  loading: boolean;       // convenience: status === 'loading'
  error: string | null;
  lastUpdated: string | null;
  refetch: () => void;
}

/**
 * Shared hook for querying any Socrata SODA dataset.
 *
 * @param uid    - Dataset UID (e.g. 'k59e-2pvf'), or null to skip entirely
 * @param params - SODA query params. Pass null or use skip=true to defer the fetch.
 * @param skip   - Explicitly prevent fetching (e.g. waiting for user input)
 */
export function useSODA<T>(
  uid: string | null,
  params: SODAQueryParams | null = {},
  skip = false
): SODAResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Stable string key so useCallback re-runs when params actually change
  const paramsKey = JSON.stringify(params);
  const fetchCount = useRef(0);

  const doFetch = useCallback(async () => {
    // Guard: uid must exist, params must be a valid object, and skip must be false
    if (!uid || skip || params === null || params === undefined) return;

    setStatus('loading');
    setError(null);
    const thisCount = ++fetchCount.current;

    try {
      const result = await fetchSODA<T>(uid, params);
      if (thisCount !== fetchCount.current) return; // stale — newer request is in flight
      setData(result.data);
      setLastUpdated(result.lastUpdated);
      setStatus('success');
    } catch (err) {
      if (thisCount !== fetchCount.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, paramsKey, skip]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { data, status, loading: status === 'loading', error, lastUpdated, refetch: doFetch };
}
