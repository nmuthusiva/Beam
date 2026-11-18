import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import { captureMock as capture } from '../hud/tests/capture.mock.ts';
import { useProjectSelection } from './useProjectSelection';

vi.mock('~/api/capture', () => ({ capture }));

describe('useProjectSelection', () => {
  const p1: CaptureProject = {
    id: 'proj-1',
    name: 'Project One',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sessionCount: 1,
    previewSrc: null,
  };
  const p2: CaptureProject = {
    id: 'proj-2',
    name: 'Project Two',
    createdAt: '2026-01-02',
    updatedAt: '2026-01-02',
    sessionCount: 1,
    previewSrc: null,
  };
  const p3: CaptureProject = {
    id: 'proj-3',
    name: 'Project Three',
    createdAt: '2026-01-03',
    updatedAt: '2026-01-03',
    sessionCount: 1,
    previewSrc: null,
  };
  const p4: CaptureProject = {
    id: 'proj-4',
    name: 'Project Four',
    createdAt: '2026-01-04',
    updatedAt: '2026-01-04',
    sessionCount: 1,
    previewSrc: null,
  };

  const setup = () => {
    const projects = ref<CaptureProject[]>([p1, p2, p3, p4]);
    const filteredProjects = computed(() => projects.value);
    const selectedProjectId = ref<string | null>('proj-1');
    const selectProject = vi.fn((project: CaptureProject) => {
      selectedProjectId.value = project.id;
    });
    const isSearchOpen = ref(false);
    const searchQuery = ref('');

    const selection = useProjectSelection({
      projects,
      filteredProjects,
      totalProjects: computed(() => projects.value.length),
      hasMore: ref(false),
      loadAll: vi.fn(),
      invalidateCatalog: vi.fn(),
      loadProjects: vi.fn(),
      selectedProjectId,
      selectProject,
      isSearchOpen,
      searchQuery,
      isActive: () => true,
    });

    return { selection, selectedProjectId, selectProject, projects };
  };

  it('selects single project on normal click without modifiers', () => {
    const { selection, selectedProjectId, selectProject } = setup();

    selection.handleProjectClick(p2, {} as MouseEvent);
    expect(selectProject).toHaveBeenCalledWith(p2);
    expect(selectedProjectId.value).toBe('proj-2');
    expect(selection.isSelectionMode.value).toBe(false);
  });

  it('enters selection mode and toggles project on Ctrl+Click', () => {
    const { selection } = setup();

    // Ctrl+Click on p2: should enter selection mode and select both previous (p1) and p2
    const ctrlEvent = { ctrlKey: true } as MouseEvent;
    selection.handleProjectClick(p2, ctrlEvent);

    expect(selection.isSelectionMode.value).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-1')).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-2')).toBe(true);

    // Ctrl+Click again on p1: should unselect p1
    selection.handleProjectClick(p1, ctrlEvent);
    expect(selection.selectedBatchIds.value.has('proj-1')).toBe(false);
    expect(selection.selectedBatchIds.value.has('proj-2')).toBe(true);

    // Ctrl+Click on p3: should add p3
    selection.handleProjectClick(p3, ctrlEvent);
    expect(selection.selectedBatchIds.value.has('proj-3')).toBe(true);
    expect(selection.selectedBatchIds.value.size).toBe(2);
  });

  it('enters selection mode and range-selects on Shift+Click', () => {
    const { selection } = setup();

    // Shift+Click on p3 when p1 was selected: should select p1, p2, p3
    const shiftEvent = { shiftKey: true } as MouseEvent;
    selection.handleProjectClick(p3, shiftEvent);

    expect(selection.isSelectionMode.value).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-1')).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-2')).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-3')).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-4')).toBe(false);
  });

  it('updates range selection when Shift+Clicking a new target', () => {
    const { selection } = setup();

    // First normal click on p2
    selection.handleProjectClick(p2, {} as MouseEvent);

    // Shift+Click on p4: selects p2, p3, p4
    selection.handleProjectClick(p4, { shiftKey: true } as MouseEvent);
    expect(selection.selectedBatchIds.value.size).toBe(3);
    expect(selection.selectedBatchIds.value.has('proj-2')).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-3')).toBe(true);
    expect(selection.selectedBatchIds.value.has('proj-4')).toBe(true);
  });

  it('selects all projects on toggleSelectAll', async () => {
    const { selection } = setup();
    selection.isSelectionMode.value = true;

    await selection.toggleSelectAll();
    expect(selection.isAllSelected.value).toBe(true);
    expect(selection.selectedBatchIds.value.size).toBe(4);

    await selection.toggleSelectAll();
    expect(selection.selectedBatchIds.value.size).toBe(0);
  });

  it('clears selection and exits selection mode on cancelSelectionMode', () => {
    const { selection } = setup();
    selection.handleProjectClick(p2, { ctrlKey: true } as MouseEvent);
    expect(selection.isSelectionMode.value).toBe(true);

    selection.cancelSelectionMode();
    expect(selection.isSelectionMode.value).toBe(false);
    expect(selection.selectedBatchIds.value.size).toBe(0);
  });
});
