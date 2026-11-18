export type ProjectSortOption =
  | 'date-desc'
  | 'date-asc'
  | 'duration-desc'
  | 'duration-asc'
  | 'name-asc'
  | 'name-desc';

export interface ProjectSortItem {
  key: ProjectSortOption;
  labelKey: string;
}
