import { computed, getCurrentInstance, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import type { CaptureProject } from '~/api/types/capture-api';
import { capture } from '~/api/capture';

export interface UseProjectSelectionOptions {
  projects: Ref<CaptureProject[]>;
  filteredProjects: ComputedRef<CaptureProject[]>;
  totalProjects: ComputedRef<number>;
  hasMore: Ref<boolean>;
  loadAll: () => Promise<void>;
  invalidateCatalog: () => void;
  loadProjects: () => Promise<void>;
  selectedProjectId: Ref<string | null>;
  selectProject: (project: CaptureProject) => void;
  isSearchOpen: Ref<boolean>;
  searchQuery: Ref<string>;
  isActive: () => boolean;
  onDeleteProject?: (project: CaptureProject) => void;
  onSelectProject?: (project: CaptureProject | null) => void;
}

export function useProjectSelection(options: UseProjectSelectionOptions) {
  const {
    projects,
    filteredProjects,
    totalProjects,
    hasMore,
    loadAll,
    invalidateCatalog,
    loadProjects,
    selectedProjectId,
    selectProject,
    isSearchOpen,
    searchQuery,
    isActive,
    onDeleteProject,
    onSelectProject,
  } = options;

  const isSelectionMode = ref(false);
  const selectedBatchIds = ref<Set<string>>(new Set());
  const lastSelectedProjectId = ref<string | null>(null);
  const isDeletingBatch = ref(false);
  const deleteBatchError = ref('');
  const isSelectingAll = ref(false);
  let selectionGeneration = 0;

  const isAllSelected = computed(() => {
    const list = filteredProjects.value;
    return (
      totalProjects.value > 0 &&
      selectedBatchIds.value.size === totalProjects.value &&
      list.every((p) => selectedBatchIds.value.has(p.id))
    );
  });

  const isSomeSelected = computed(() => {
    const list = filteredProjects.value;
    const count = list.filter((p) => selectedBatchIds.value.has(p.id)).length;
    return count > 0 && !isAllSelected.value;
  });

  const toggleSelectionMode = () => {
    if (isSearchOpen.value) {
      isSearchOpen.value = false;
      searchQuery.value = '';
    }
    isSelectionMode.value = !isSelectionMode.value;
    if (!isSelectionMode.value) {
      selectionGeneration++;
      selectedBatchIds.value = new Set();
      lastSelectedProjectId.value = null;
    }
  };

  const cancelSelectionMode = () => {
    selectionGeneration++;
    isSelectionMode.value = false;
    selectedBatchIds.value = new Set();
    lastSelectedProjectId.value = null;
  };

  const toggleBatchSelect = (id: string) => {
    const next = new Set(selectedBatchIds.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedBatchIds.value = next;
    lastSelectedProjectId.value = id;
  };

  const toggleSelectAll = async () => {
    if (isSelectingAll.value) return;
    if (isAllSelected.value) {
      selectedBatchIds.value = new Set();
    } else {
      if (hasMore.value) {
        const current = ++selectionGeneration;
        isSelectingAll.value = true;
        try {
          await loadAll();
          if (current !== selectionGeneration || !isSelectionMode.value || !isActive()) return;
        } catch (error) {
          deleteBatchError.value = error instanceof Error ? error.message : String(error);
          return;
        } finally {
          isSelectingAll.value = false;
        }
      }
      selectedBatchIds.value = new Set(filteredProjects.value.map((p) => p.id));
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedBatchIds.value.size === 0 || isDeletingBatch.value) return;
    isDeletingBatch.value = true;
    deleteBatchError.value = '';
    try {
      const ids = Array.from(selectedBatchIds.value);
      for (const id of ids) {
        const project = projects.value.find((item) => item.id === id);
        if (project?.mode === 'screenshot') await capture.deleteProject(id, 'screenshot');
        else await capture.deleteProject(id);
        if (project) onDeleteProject?.(project);
      }
      const wasSelectedDeleted = selectedProjectId.value && selectedBatchIds.value.has(selectedProjectId.value);
      selectedBatchIds.value = new Set();
      isSelectionMode.value = false;
      invalidateCatalog();
      await loadProjects();

      if (wasSelectedDeleted) {
        const remaining = projects.value;
        const nextProject = remaining[0] ?? null;
        if (nextProject) {
          selectedProjectId.value = nextProject.id;
          onSelectProject?.(nextProject);
        } else {
          selectedProjectId.value = null;
          onSelectProject?.(null);
        }
      }
    } catch (error) {
      deleteBatchError.value = error instanceof Error ? error.message : String(error);
    } finally {
      isDeletingBatch.value = false;
    }
  };

  const handleProjectClick = (project: CaptureProject, event?: MouseEvent) => {
    const isCtrlOrCmd = Boolean(event?.ctrlKey || event?.metaKey);
    const isShift = Boolean(event?.shiftKey);

    if (isCtrlOrCmd) {
      if (!isSelectionMode.value) {
        isSelectionMode.value = true;
        const initial = new Set<string>();
        if (selectedProjectId.value && selectedProjectId.value !== project.id) {
          initial.add(selectedProjectId.value);
        }
        initial.add(project.id);
        selectedBatchIds.value = initial;
      } else {
        const next = new Set(selectedBatchIds.value);
        if (next.has(project.id)) {
          next.delete(project.id);
        } else {
          next.add(project.id);
        }
        selectedBatchIds.value = next;
      }
      lastSelectedProjectId.value = project.id;
      selectedProjectId.value = project.id;
      return;
    }

    if (isShift) {
      if (!isSelectionMode.value) {
        isSelectionMode.value = true;
      }
      const list = filteredProjects.value;
      const anchorId = lastSelectedProjectId.value || selectedProjectId.value || list[0]?.id;
      const anchorIndex = list.findIndex((p) => p.id === anchorId);
      const targetIndex = list.findIndex((p) => p.id === project.id);

      if (targetIndex !== -1) {
        const start = Math.min(anchorIndex !== -1 ? anchorIndex : 0, targetIndex);
        const end = Math.max(anchorIndex !== -1 ? anchorIndex : 0, targetIndex);
        const next = new Set<string>();
        for (let i = start; i <= end; i++) {
          const item = list[i];
          if (item) next.add(item.id);
        }
        selectedBatchIds.value = next;
      }
      selectedProjectId.value = project.id;
      return;
    }

    if (isSelectionMode.value) {
      toggleBatchSelect(project.id);
      lastSelectedProjectId.value = project.id;
      selectedProjectId.value = project.id;
    } else {
      selectProject(project);
      lastSelectedProjectId.value = project.id;
    }
  };

  const handleSelectionKeydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      event.preventDefault();
      if (!isSelectionMode.value) {
        isSelectionMode.value = true;
      }
      void toggleSelectAll();
    }
  };

  if (getCurrentInstance()) {
    onMounted(() => window.addEventListener('keydown', handleSelectionKeydown));
    onUnmounted(() => window.removeEventListener('keydown', handleSelectionKeydown));
  }

  return {
    isSelectionMode,
    selectedBatchIds,
    lastSelectedProjectId,
    isDeletingBatch,
    deleteBatchError,
    isSelectingAll,
    isAllSelected,
    isSomeSelected,
    toggleSelectionMode,
    cancelSelectionMode,
    toggleBatchSelect,
    toggleSelectAll,
    handleDeleteBatch,
    handleProjectClick,
  };
}
