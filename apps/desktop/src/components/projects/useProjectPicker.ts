import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useScrollShadow } from '~/ui/scroll-shadow/useScrollShadow';
import { capture } from '~/api/capture';
import type { CaptureProject } from '~/api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import { useProjectPreviews } from './useProjectPreviews';
import { useProjectGrid } from './useProjectGrid';
import { useProjectSearch } from './useProjectSearch';
import { useProjectCatalog } from './useProjectCatalog';
import { useProjectCreation } from './useProjectCreation';
import { createProjectPickerRefresh } from './project-picker-refresh';
import type { ProjectPickerProps, ProjectPickerEmit } from './project-picker-types';
import { useProjectSort } from './useProjectSort';
import { useProjectCombine } from './useProjectCombine';
import { useProjectSelection } from './useProjectSelection';

export function useProjectPicker(props: ProjectPickerProps, emit: ProjectPickerEmit) {
  const { t } = useTranslate('ProjectPicker');
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const selectedProjectId = ref<string | null>(null);

  const selectProject = (project: CaptureProject) => {
    selectedProjectId.value = project.id;
    if (props.compact) emit('select-project', project);
  };

  const { isSearchOpen, searchQuery, searchInputRef, toggleSearch, clearSearch, handleSearchKeydown } =
    useProjectSearch(() => !props.compact && !isNewProjectOpen.value && !renameProjectId.value, () => selection.cancelSelectionMode());
  const catalog = useProjectCatalog(searchQuery, () => props.active !== false);
  const { projects, isLoading, errorMessage, isLoadingMore, loadMoreError } = catalog;

  const { currentSort, sortOptions, setSort, sortProjects } = useProjectSort((sort) => {
    if (sort !== 'date-desc' && catalog.hasMore.value) {
      void catalog.loadAll();
    }
  });

  const filteredProjects = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    const base = query ? projects.value.filter((project) => project.name.toLowerCase().includes(query)) : projects.value;
    return sortProjects(base);
  });

  const selection = useProjectSelection({
    projects,
    filteredProjects,
    totalProjects: catalog.total,
    hasMore: catalog.hasMore,
    loadAll: catalog.loadAll,
    invalidateCatalog: catalog.invalidate,
    loadProjects: () => loadProjects(),
    selectedProjectId,
    selectProject,
    isSearchOpen,
    searchQuery,
    isActive: () => props.active !== false,
    onDeleteProject: (project) => emit('delete-project', project),
    onSelectProject: (project) => {
      if (project) emit('select-project', project);
    },
  });

  const combine = useProjectCombine({
    projects,
    selectedBatchIds: selection.selectedBatchIds,
    refresh: async () => {
      catalog.invalidate();
      await loadProjects();
    },
    cancelSelection: selection.cancelSelectionMode,
    onProjectCreated: (created) => {
      selectProject(created);
      emit('select-project', created);
    },
  });

  const { list, containerProps, wrapperProps, gridRef, gridStyle } = useProjectGrid(
    filteredProjects,
    () => props.compact,
  );
  watch(catalog.version, () => {
    const container = containerProps.ref.value;
    if (container) container.scrollTop = 0;
    void nextTick(containerProps.onScroll);
  });
  watch(
    [list, isLoadingMore],
    ([rows, loadingMore]) => {
      const last = rows.at(-1)?.data.at(-1);
      if (
        !loadingMore &&
        gridRef.value &&
        Number.parseFloat(gridStyle.value['--project-card-size']) > 0 &&
        props.active !== false &&
        last &&
        !loadMoreError.value &&
        catalog.hasMore.value &&
        projects.value.findIndex((project) => project.id === last.id) >= projects.value.length - 8
      )
        void catalog.loadMore();
    },
    { flush: 'post' },
  );

  const { hasTopShadow, hasBottomShadow } = useScrollShadow(containerProps.ref, {
    offset: 2,
    orientation: 'vertical',
  });

  const maskStyle = computed(() => {
    const top = hasTopShadow.value;
    const bottom = hasBottomShadow.value;
    const grad =
      top && bottom
        ? 'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)'
        : top
          ? 'linear-gradient(to bottom, transparent 0%, black 24px, black 100%)'
          : bottom
            ? 'linear-gradient(to bottom, black 0%, black calc(100% - 24px), transparent 100%)'
            : null;
    return grad ? { maskImage: grad, WebkitMaskImage: grad } : {};
  });

  const previews = useProjectPreviews(
    containerProps.ref,
    computed(() => (props.active === false ? [] : list.value.flatMap((row) => row.data))),
  );

  const selectedProject = computed(
    () => projects.value.find((project) => project.id === selectedProjectId.value) ?? null,
  );

  const isRefreshing = ref(false);
  const isRefreshSuccess = ref(false);
  let refreshSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

  const loadProjects = async () => {
    await catalog.load();
    selectedProjectId.value =
      projects.value.some((project) => project.id === props.currentProjectId) ||
      (catalog.hasMore.value && props.currentProjectId)
        ? props.currentProjectId
        : (projects.value[0]?.id ?? null);
  };
  const reopeningRefresh = createProjectPickerRefresh(() => {
    void loadProjects();
  });

  const handleRefresh = async () => {
    if (isRefreshing.value || isLoading.value || isLoadingMore.value) return;
    isRefreshing.value = true;
    isRefreshSuccess.value = false;
    if (refreshSuccessTimeout) clearTimeout(refreshSuccessTimeout);
    try {
      await catalog.load(true);
      if (errorMessage.value) return;
      selectedProjectId.value = projects.value.some((project) => project.id === props.currentProjectId)
        ? props.currentProjectId
        : (projects.value[0]?.id ?? null);
      isRefreshSuccess.value = true;
      await nextTick();
      previews.retryVisibleThumbnails();
      refreshSuccessTimeout = setTimeout(() => {
        isRefreshSuccess.value = false;
      }, 1600);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      isRefreshing.value = false;
    }
  };

  const openSelectedProject = () => {
    if (selectedProject.value && selectedProject.value.id !== props.currentProjectId) {
      emit('open-project', selectedProject.value);
    }
  };

  const formatDate = (date?: string | null) => {
    if (!date) return t('dateUnknown');
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return t('dateUnknown');
    return dateFormatter.format(parsedDate);
  };

  const handleProjectOpen = (project: CaptureProject) => {
    selectProject(project);
    openSelectedProject();
  };

  watch(
    () => props.active !== false,
    (active) => {
      reopeningRefresh.cancel();
      if (!active) {
        selection.cancelSelectionMode();
        return;
      }
      if (catalog.hasLoaded()) reopeningRefresh.schedule();
      else void loadProjects();
      void nextTick(() => containerProps.onScroll());
    },
    { immediate: true },
  );

  onUnmounted(() => {
    reopeningRefresh.cancel();
    if (refreshSuccessTimeout) clearTimeout(refreshSuccessTimeout);
  });

  watch(
    () => props.currentProjectId,
    (projectId) => {
      if (projectId && projects.value.some((project) => project.id === projectId)) {
        selectedProjectId.value = projectId;
      }
    },
  );

  const creation = useProjectCreation({
    refresh: async () => {
      catalog.invalidate();
      void loadProjects();
    },
    open: (project) => emit('open-project', project),
  });
  const { isNewProjectOpen } = creation;

  // Rename project states
  const renameProjectId = ref('');
  const renameValue = ref('');
  const renameError = ref('');
  const renameBusy = ref(false);

  // Delete project states
  const deleteProjectId = ref('');
  const deleteError = ref('');
  const deleteBusy = ref(false);
  const deleteConfirmProjectId = ref<string | null>(null);

  const handleActionPopoverToggle = (isOpen: boolean) => {
    if (!isOpen) {
      deleteConfirmProjectId.value = null;
      deleteError.value = '';
    }
    emit('toggle-popover', isOpen);
  };

  const startRename = (project: CaptureProject) => {
    renameProjectId.value = project.id;
    renameValue.value = project.name;
    renameError.value = '';
    void nextTick(() => {
      const cardEl = document.querySelector<HTMLElement>(`.project-card-container[data-project-id="${project.id}"]`);
      const inputEl = cardEl?.querySelector<HTMLInputElement>('input');
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    });
  };

  const cancelRename = () => {
    renameProjectId.value = '';
    renameValue.value = '';
  };

  const handleRenameProject = async () => {
    if (renameBusy.value || !renameProjectId.value) return;
    const trimmed = renameValue.value.trim();
    const originalProject = projects.value.find((p) => p.id === renameProjectId.value);
    if (!trimmed || (originalProject && originalProject.name === trimmed)) {
      cancelRename();
      return;
    }
    renameBusy.value = true;
    renameError.value = '';
    try {
      const renamed =
        originalProject?.mode === 'screenshot'
          ? await capture.renameProject(renameProjectId.value, trimmed, 'screenshot')
          : await capture.renameProject(renameProjectId.value, trimmed);
      emit('rename-project', renamed);
      catalog.invalidate();
      await loadProjects();
      cancelRename();
    } catch (error) {
      renameError.value = error instanceof Error ? error.message : String(error);
      console.error('Rename failed:', renameError.value);
      cancelRename();
    } finally {
      renameBusy.value = false;
    }
  };

  const confirmDeleteProject = (project: CaptureProject) => {
    deleteProjectId.value = project.id;
    deleteError.value = '';
    deleteConfirmProjectId.value = project.id;
  };

  const handleDeleteProject = async () => {
    deleteBusy.value = true;
    deleteError.value = '';
    try {
      const project = projects.value.find((item) => item.id === deleteProjectId.value);
      const wasSelectedDeleted = selectedProjectId.value === deleteProjectId.value;
      if (project?.mode === 'screenshot') await capture.deleteProject(deleteProjectId.value, 'screenshot');
      else await capture.deleteProject(deleteProjectId.value);
      if (project) emit('delete-project', project);
      catalog.invalidate();
      await loadProjects();
      deleteConfirmProjectId.value = null;

      // If the currently selected project was deleted, pick the first remaining one
      if (wasSelectedDeleted) {
        const remaining = projects.value;
        const nextProject = remaining[0] ?? null;
        if (nextProject) {
          selectedProjectId.value = nextProject.id;
          emit('select-project', nextProject);
        } else {
          selectedProjectId.value = null;
        }
      }
    } catch (error) {
      deleteError.value = error instanceof Error ? error.message : String(error);
    } finally {
      deleteBusy.value = false;
    }
  };

  const revealProjectFolder = (project: CaptureProject) => {
    void (project.mode === 'screenshot'
      ? capture.revealProject(project.id, 'screenshot')
      : capture.revealProject(project.id));
  };

  return {
    t,
    projects,
    selectedProjectId,
    isLoading,
    errorMessage,
    isSearchOpen,
    searchQuery,
    searchInputRef,
    ...selection,
    isLoadingMore,
    loadMoreError,
    loadMore: catalog.loadMore,
    toggleSearch,
    clearSearch,
    handleSearchKeydown,
    filteredProjects,
    maskStyle,
    selectedProject,
    isRefreshing,
    isRefreshSuccess,
    loadProjects: () => loadProjects(),
    handleRefresh,
    selectProject,
    openSelectedProject,
    formatDate,
    handleProjectOpen,
    currentSort,
    sortOptions,
    setSort,
    ...combine,
    ...creation,
    renameProjectId,
    renameValue,
    renameBusy,
    deleteError,
    deleteBusy,
    deleteConfirmProjectId,
    handleActionPopoverToggle,
    startRename,
    cancelRename,
    handleRenameProject,
    confirmDeleteProject,
    handleDeleteProject,
    revealProjectFolder,
    list,
    containerProps,
    wrapperProps,
    gridRef,
    gridStyle,
    ...previews,
    invalidate: catalog.invalidate,
  };
}
