import { ref, type Ref } from 'vue';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectSortItem, ProjectSortOption } from './project-sort-types';

export const SORT_OPTIONS: ProjectSortItem[] = [
  { key: 'date-desc', labelKey: 'sortByDateNewest' },
  { key: 'date-asc', labelKey: 'sortByDateOldest' },
  { key: 'duration-desc', labelKey: 'sortByDurationLongest' },
  { key: 'duration-asc', labelKey: 'sortByDurationShortest' },
  { key: 'name-asc', labelKey: 'sortByNameAsc' },
  { key: 'name-desc', labelKey: 'sortByNameDesc' },
];

export function useProjectSort(onSortChange?: (sort: ProjectSortOption) => void) {
  const currentSort = ref<ProjectSortOption>('date-desc');

  const setSort = (sort: ProjectSortOption) => {
    if (currentSort.value === sort) return;
    currentSort.value = sort;
    onSortChange?.(sort);
  };

  const sortProjects = (list: CaptureProject[]): CaptureProject[] => {
    const sorted = [...list];
    switch (currentSort.value) {
      case 'date-asc':
        return sorted.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return timeA - timeB;
        });
      case 'duration-desc':
        return sorted.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
      case 'duration-asc':
        return sorted.sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0));
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
      case 'date-desc':
      default:
        return sorted.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return timeB - timeA;
        });
    }
  };

  return {
    currentSort,
    sortOptions: SORT_OPTIONS,
    setSort,
    sortProjects,
  };
}
