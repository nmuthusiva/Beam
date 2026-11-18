import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import { setCurrentLocale } from '~/i18n';
import ProjectCombineDialog from './ProjectCombineDialog.vue';

enableAutoUnmount(afterEach);
beforeEach(() => setCurrentLocale('en'));
afterEach(() => setCurrentLocale('en'));

const dialogStub = {
  Dialog: {
    props: ['isOpen'],
    template: '<div v-if="isOpen"><slot/><slot name="footer" :close="() => $emit(\'close\')"/></div>',
  },
};

describe('ProjectCombineDialog', () => {
  const p1: CaptureProject = {
    id: 'proj-1',
    name: 'Project One',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sessionCount: 1,
    previewSrc: null,
    durationMs: 4000,
  };

  const p2: CaptureProject = {
    id: 'proj-2',
    name: 'Project Two',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    sessionCount: 1,
    previewSrc: null,
    durationMs: 8000,
  };

  const p3: CaptureProject = {
    id: 'proj-3',
    name: 'Project Three',
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
    sessionCount: 1,
    previewSrc: null,
    durationMs: 2000,
  };

  it('renders reorder list and allows moving items down and up', async () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1, p2, p3],
        busy: false,
      },
      global: {
        stubs: dialogStub,
      },
    });

    const items = wrapper.findAll('.reorder-item');
    expect(items.length).toBe(3);
    expect(items[0]!.text()).toContain('Project One');
    expect(items[1]!.text()).toContain('Project Two');
    expect(items[2]!.text()).toContain('Project Three');

    // Move first item down
    const firstMoveDown = items[0]!.findAll('button')[1]!;
    await firstMoveDown.trigger('click');

    const updatedItems = wrapper.findAll('.reorder-item');
    expect(updatedItems[0]!.text()).toContain('Project Two');
    expect(updatedItems[1]!.text()).toContain('Project One');
    expect(updatedItems[2]!.text()).toContain('Project Three');

    // Move second item back up
    const secondMoveUp = updatedItems[1]!.findAll('button')[0]!;
    await secondMoveUp.trigger('click');

    const finalItems = wrapper.findAll('.reorder-item');
    expect(finalItems[0]!.text()).toContain('Project One');
    expect(finalItems[1]!.text()).toContain('Project Two');
  });

  it('emits combine event with ordered IDs and copy mode by default', async () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1, p2],
        busy: false,
      },
      global: {
        stubs: dialogStub,
      },
    });

    const combineBtn = wrapper.findAll('button').find((b) => b.text().includes('Combine'));
    expect(combineBtn).toBeDefined();
    await combineBtn!.trigger('click');

    expect(wrapper.emitted('combine')).toHaveLength(1);
    const event = wrapper.emitted('combine')![0]![0] as any;
    expect(event.projectIds).toEqual(['proj-1', 'proj-2']);
    expect(event.deleteOriginals).toBe(false);
  });

  it('supports selecting delete originals mode', async () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1, p2],
        busy: false,
      },
      global: {
        stubs: dialogStub,
      },
    });

    const deleteCard = wrapper.find('.mode-card.danger');
    await deleteCard.trigger('click');

    const combineBtn = wrapper.findAll('button').find((b) => b.text().includes('Combine'));
    await combineBtn!.trigger('click');

    const event = wrapper.emitted('combine')![0]![0] as any;
    expect(event.deleteOriginals).toBe(true);
  });

  it('displays formatted creation timestamp and duration on project items', () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1],
        busy: false,
      },
      global: {
        stubs: dialogStub,
      },
    });

    const item = wrapper.find('.reorder-item');
    expect(item.find('.project-timestamp').exists()).toBe(true);
    expect(item.find('.project-duration').exists()).toBe(true);
    expect(item.find('.project-duration').text()).toBe('0:04');
  });

  it('updates default combined name on reordering unless manually edited', async () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1, p2],
        busy: false,
      },
      global: {
        stubs: dialogStub,
      },
    });

    const input = wrapper.find('input');
    expect(input.element.value).toBe('Project One + Project Two');

    // Move first item down
    const items = wrapper.findAll('.reorder-item');
    const moveDown = items[0]!.findAll('button')[1]!;
    await moveDown.trigger('click');

    expect(input.element.value).toBe('Project Two + Project One');
  });

  it('renders progress, status, and caution alert when busy', async () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1, p2],
        busy: true,
        progress: {
          current: 1,
          total: 2,
          percent: 50,
          currentProjectName: 'Project Two',
          completedProjectName: 'Project One',
          stage: 'processing',
        },
      },
      global: {
        stubs: dialogStub,
      },
    });

    // Check caution alert banner
    const cautionCard = wrapper.find('.combine-caution-card');
    expect(cautionCard.exists()).toBe(true);
    expect(cautionCard.text()).toContain('Do not close or interrupt');
    expect(cautionCard.text()).toContain('Combining is in progress');

    // Check progress percent label
    expect(wrapper.find('.progress-percent-label').text()).toBe('50%');

    // Check completed and in-progress status items
    const completedItem = wrapper.find('.progress-status-item.completed');
    expect(completedItem.exists()).toBe(true);
    expect(completedItem.text()).toContain('Project One');
    expect(completedItem.text()).toContain('is completed');

    const inProgressItem = wrapper.find('.progress-status-item.in-progress');
    expect(inProgressItem.exists()).toBe(true);
    expect(inProgressItem.text()).toContain('Project Two');
    expect(inProgressItem.text()).toContain('in progress, please wait...');
    expect(inProgressItem.text()).toContain('(50%)');

    // Buttons should be disabled
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('Cancel'));
    expect(cancelBtn?.attributes('disabled')).toBeDefined();
  });

  it('accumulates completed projects across multiple progress updates', async () => {
    const wrapper = mount(ProjectCombineDialog, {
      props: {
        open: true,
        projects: [p1, p2, p3],
        busy: true,
        progress: {
          current: 1,
          total: 3,
          percent: 30,
          currentProjectName: 'Project One',
          stage: 'processing',
        },
      },
      global: {
        stubs: dialogStub,
      },
    });

    expect(wrapper.findAll('.progress-status-item.completed')).toHaveLength(0);

    // Update with project 1 completed, project 2 in progress
    await wrapper.setProps({
      progress: {
        current: 2,
        total: 3,
        percent: 65,
        currentProjectName: 'Project Two',
        completedProjectName: 'Project One',
        stage: 'processing',
      },
    });

    const completed = wrapper.findAll('.progress-status-item.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]!.text()).toContain('Project One is completed');

    const inProg = wrapper.find('.progress-status-item.in-progress');
    expect(inProg.text()).toContain('Project Two in progress, please wait... (65%)');

    // Update with project 2 completed, project 3 in progress
    await wrapper.setProps({
      progress: {
        current: 3,
        total: 3,
        percent: 90,
        currentProjectName: 'Project Three',
        completedProjectName: 'Project Two',
        stage: 'processing',
      },
    });

    const completed2 = wrapper.findAll('.progress-status-item.completed');
    expect(completed2).toHaveLength(2);
    expect(completed2[0]!.text()).toContain('Project One is completed');
    expect(completed2[1]!.text()).toContain('Project Two is completed');
  });
});
