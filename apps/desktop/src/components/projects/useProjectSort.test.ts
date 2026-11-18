import { describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import { useProjectSort } from './useProjectSort';

describe('useProjectSort', () => {
  const p1: CaptureProject = {
    id: '1',
    name: 'Beta Project',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    sessionCount: 1,
    previewSrc: null,
    durationMs: 5000,
  };

  const p2: CaptureProject = {
    id: '2',
    name: 'Alpha Project',
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-04T00:00:00Z',
    sessionCount: 1,
    previewSrc: null,
    durationMs: 12000,
  };

  const p3: CaptureProject = {
    id: '3',
    name: 'Gamma Project',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-01-06T00:00:00Z',
    sessionCount: 1,
    previewSrc: null,
    durationMs: 2000,
  };

  it('defaults to date-desc order', () => {
    const { currentSort, sortProjects } = useProjectSort();
    expect(currentSort.value).toBe('date-desc');
    const sorted = sortProjects([p1, p2, p3]);
    expect(sorted.map((p) => p.id)).toEqual(['3', '2', '1']);
  });

  it('sorts by date-asc order', () => {
    const { setSort, sortProjects } = useProjectSort();
    setSort('date-asc');
    const sorted = sortProjects([p3, p1, p2]);
    expect(sorted.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by duration-desc order', () => {
    const { setSort, sortProjects } = useProjectSort();
    setSort('duration-desc');
    const sorted = sortProjects([p1, p2, p3]);
    expect(sorted.map((p) => p.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by duration-asc order', () => {
    const { setSort, sortProjects } = useProjectSort();
    setSort('duration-asc');
    const sorted = sortProjects([p1, p2, p3]);
    expect(sorted.map((p) => p.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by name-asc order', () => {
    const { setSort, sortProjects } = useProjectSort();
    setSort('name-asc');
    const sorted = sortProjects([p3, p1, p2]);
    expect(sorted.map((p) => p.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by name-desc order', () => {
    const { setSort, sortProjects } = useProjectSort();
    setSort('name-desc');
    const sorted = sortProjects([p1, p2, p3]);
    expect(sorted.map((p) => p.id)).toEqual(['3', '1', '2']);
  });

  it('invokes callback when sort changes', () => {
    const callback = vi.fn();
    const { setSort } = useProjectSort(callback);
    setSort('name-asc');
    expect(callback).toHaveBeenCalledWith('name-asc');
    setSort('name-asc');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
