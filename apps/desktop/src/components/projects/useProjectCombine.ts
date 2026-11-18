import { computed, ref, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectCombineProgress } from '~/api/types/capture-config';
import { useToastStore } from '~/ui/toast/toastStore';
import { useTranslate } from '~/i18n/useTranslate';
import type { ProjectCombineRequest } from './project-combine-types';

export function useProjectCombine(options: {
  projects: Ref<CaptureProject[]>;
  selectedBatchIds: Ref<Set<string>>;
  refresh: () => Promise<void>;
  cancelSelection: () => void;
  onProjectCreated?: (project: CaptureProject) => void;
}) {
  const { t } = useTranslate('ProjectPicker');

  const isCombineOpen = ref(false);
  const isCombining = ref(false);
  const combineError = ref('');
  const combineProgress = ref<ProjectCombineProgress | null>(null);

  const selectedCombineProjects = computed(() => {
    const ids = options.selectedBatchIds.value;
    return options.projects.value.filter((project) => ids.has(project.id));
  });

  const openCombineDialog = () => {
    if (options.selectedBatchIds.value.size < 2) return;
    combineError.value = '';
    combineProgress.value = null;
    isCombineOpen.value = true;
  };

  const handleCombine = async (request: ProjectCombineRequest) => {
    if (isCombining.value) return;
    isCombining.value = true;
    combineError.value = '';
    combineProgress.value = {
      current: 0,
      total: request.projectIds.length,
      percent: 5,
      stage: 'preparing',
    };

    const unsubscribe = capture.onCombineProgress?.((progress) => {
      combineProgress.value = progress;
    });

    try {
      const created = await capture.combineProjects({
        projectIds: request.projectIds,
        name: request.name,
        deleteOriginals: request.deleteOriginals,
      });
      isCombineOpen.value = false;
      combineProgress.value = null;
      options.cancelSelection();
      await options.refresh();
      if (created) {
        options.onProjectCreated?.(created);
      }
      try {
        const toast = useToastStore();
        toast.success(t('combineProjects'));
      } catch {}
    } catch (error) {
      combineError.value = error instanceof Error ? error.message : String(error);
    } finally {
      unsubscribe?.();
      isCombining.value = false;
    }
  };

  return {
    isCombineOpen,
    isCombining,
    combineError,
    combineProgress,
    selectedCombineProjects,
    openCombineDialog,
    handleCombine,
  };
}
