import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectCombineProgress } from '~/api/types/capture-config';

export type { ProjectCombineProgress };
export type CombineMode = 'copy' | 'delete';

export interface ProjectCombineRequest {
  projectIds: string[];
  name?: string;
  deleteOriginals: boolean;
}

export interface ProjectCombineDialogProps {
  open: boolean;
  projects: CaptureProject[];
  busy: boolean;
  error?: string;
  progress?: ProjectCombineProgress | null;
}

export interface ProjectCombineDialogEvents {
  (e: 'update:open', value: boolean): void;
  (e: 'combine', request: ProjectCombineRequest): void;
}
