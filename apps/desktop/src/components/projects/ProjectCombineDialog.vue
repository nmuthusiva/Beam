<script setup lang="ts">
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Film,
  Layers,
  Loader2,
  Trash2,
} from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectCombineProgress } from '~/api/types/capture-config';
import Button from '~/ui/button/Button.vue';
import Dialog from '~/ui/dialog/Dialog.vue';
import Input from '~/ui/input/Input.vue';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { CombineMode, ProjectCombineRequest } from './project-combine-types';
import { formatProjectDuration } from './project-format-duration';

const props = defineProps<{
  open: boolean;
  projects: CaptureProject[];
  busy: boolean;
  error?: string;
  progress?: ProjectCombineProgress | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  combine: [request: ProjectCombineRequest];
}>();

const { t } = useTranslate('ProjectPicker');

const orderedProjects = ref<CaptureProject[]>([]);
const combinedName = ref('');
const combineMode = ref<CombineMode>('copy');
const isNameManuallyEdited = ref(false);
const completedProjectNames = ref<string[]>([]);

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatProjectTimestamp = (dateString?: string) => {
  if (!dateString) return '';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return '';
  return timestampFormatter.format(parsed);
};

const computeDefaultName = (list: CaptureProject[]) => {
  const names = list.map((p) => p.name).filter(Boolean);
  return names.slice(0, 2).join(' + ') + (names.length > 2 ? ` + ${names.length - 2}` : '');
};

const updateDefaultName = () => {
  if (!isNameManuallyEdited.value) {
    combinedName.value = computeDefaultName(orderedProjects.value);
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      orderedProjects.value = [...props.projects];
      combineMode.value = 'copy';
      isNameManuallyEdited.value = false;
      combinedName.value = computeDefaultName(props.projects);
      completedProjectNames.value = [];
    }
  },
  { immediate: true },
);

watch(
  () => props.projects,
  (newProjects) => {
    if (props.open && !props.busy) {
      orderedProjects.value = [...newProjects];
      updateDefaultName();
    }
  },
);

watch(
  () => props.progress?.completedProjectName,
  (name) => {
    if (name && !completedProjectNames.value.includes(name)) {
      completedProjectNames.value.push(name);
    }
  },
  { immediate: true },
);

watch(
  () => props.busy,
  (isBusy) => {
    if (!isBusy) {
      completedProjectNames.value = [];
    }
  },
);

const progressPercent = computed(() => {
  if (props.progress && typeof props.progress.percent === 'number') {
    return Math.min(100, Math.max(0, props.progress.percent));
  }
  return props.busy ? 5 : 0;
});

const currentProcessingName = computed(() => {
  if (props.progress?.currentProjectName) {
    return props.progress.currentProjectName;
  }
  return orderedProjects.value[0]?.name || '';
});

const moveUp = (index: number) => {
  if (index <= 0) return;
  const list = [...orderedProjects.value];
  const item = list[index];
  const prev = list[index - 1];
  if (item && prev) {
    list[index - 1] = item;
    list[index] = prev;
    orderedProjects.value = list;
    updateDefaultName();
  }
};

const moveDown = (index: number) => {
  if (index >= orderedProjects.value.length - 1) return;
  const list = [...orderedProjects.value];
  const item = list[index];
  const next = list[index + 1];
  if (item && next) {
    list[index + 1] = item;
    list[index] = next;
    orderedProjects.value = list;
    updateDefaultName();
  }
};

const handleSubmit = () => {
  if (props.busy || orderedProjects.value.length < 2) return;
  emit('combine', {
    projectIds: orderedProjects.value.map((p) => p.id),
    name: combinedName.value.trim() || undefined,
    deleteOriginals: combineMode.value === 'delete',
  });
};

const handleClose = () => {
  if (!props.busy) {
    emit('update:open', false);
  }
};
</script>

<template>
  <Dialog
    :is-open="open"
    :title="busy ? t('combiningProjects') : t('combineProjects')"
    :close-on-overlay-click="!busy"
    size="md"
    @close="handleClose"
  >
    <!-- Live Combining Progress Screen -->
    <div v-if="busy" class="combine-progress-view">
      <div class="combine-caution-card" role="alert">
        <AlertTriangle class="caution-icon" aria-hidden="true" />
        <div class="caution-content">
          <span class="caution-title">{{ t('combineCautionTitle') }}</span>
          <p class="caution-desc">{{ t('combineCautionDesc') }}</p>
        </div>
      </div>

      <div class="combine-progress-bar-block">
        <div class="progress-header">
          <span class="progress-header-label">{{ t('combiningProjects') }}</span>
          <span class="progress-percent-label">{{ progressPercent }}%</span>
        </div>
        <ProgressBar :value="progressPercent" />
      </div>

      <div class="progress-status-list" role="status" aria-live="polite">
        <div
          v-for="completedName in completedProjectNames"
          :key="completedName"
          class="progress-status-item completed"
        >
          <CheckCircle2 class="status-icon completed-icon" aria-hidden="true" />
          <span class="status-text"><span class="status-project-name">{{ completedName }}</span> {{ t('isCompleted') }}</span>
        </div>

        <div
          v-if="currentProcessingName && !completedProjectNames.includes(currentProcessingName)"
          class="progress-status-item in-progress"
        >
          <Loader2 class="status-icon in-progress-icon spin" aria-hidden="true" />
          <span class="status-text"><span class="status-project-name">{{ currentProcessingName }}</span> <span class="status-wait">{{ t('inProgressWait') }}</span> <span class="status-percent">({{ progressPercent }}%)</span></span>
        </div>

        <div
          v-else-if="props.progress?.stage === 'finalizing'"
          class="progress-status-item in-progress"
        >
          <Loader2 class="status-icon in-progress-icon spin" aria-hidden="true" />
          <span class="status-text">{{ t('finalizingCombined') }}</span>
        </div>

        <div
          v-else-if="props.progress?.stage === 'cleaning'"
          class="progress-status-item in-progress"
        >
          <Loader2 class="status-icon in-progress-icon spin" aria-hidden="true" />
          <span class="status-text">{{ t('cleaningCombined') }}</span>
        </div>
      </div>
    </div>

    <!-- Project Reordering & Merge Setup Form -->
    <div v-else class="combine-dialog-content">
      <p class="combine-description">{{ t('combineDescription') }}</p>

      <div class="combine-section">
        <label class="combine-section-label">{{ t('reorderProjects') }}</label>
        <div class="reorder-list" role="list">
          <div
            v-for="(project, index) in orderedProjects"
            :key="project.id"
            class="reorder-item"
            role="listitem"
          >
            <div class="reorder-item-left">
              <span class="order-badge">{{ index + 1 }}</span>
              <div class="project-thumb">
                <img
                  v-if="project.thumbnailSrc"
                  :src="project.thumbnailSrc"
                  :alt="project.name"
                  class="thumb-img"
                />
                <Film v-else class="thumb-icon" />
              </div>
              <div class="project-meta">
                <span class="project-name" :title="project.name">{{ project.name }}</span>
                <span class="project-meta-details">
                  <span v-if="project.createdAt || project.updatedAt" class="project-timestamp">
                    {{ formatProjectTimestamp(project.createdAt || project.updatedAt) }}
                  </span>
                  <span
                    v-if="(project.createdAt || project.updatedAt) && project.durationMs"
                    class="project-meta-dot"
                    aria-hidden="true"
                  >
                    •
                  </span>
                  <span v-if="project.durationMs" class="project-duration">
                    {{ formatProjectDuration(project.durationMs) }}
                  </span>
                </span>
              </div>
            </div>

            <div class="reorder-item-actions">
              <Button
                variant="ghost"
                size="xs"
                :icon="ArrowUp"
                icon-only
                :disabled="index === 0 || busy"
                :aria-label="t('moveUp')"
                :tooltip="t('moveUp')"
                @click="moveUp(index)"
              />
              <Button
                variant="ghost"
                size="xs"
                :icon="ArrowDown"
                icon-only
                :disabled="index === orderedProjects.length - 1 || busy"
                :aria-label="t('moveDown')"
                :tooltip="t('moveDown')"
                @click="moveDown(index)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="combine-section">
        <label class="combine-section-label" for="combined-project-name">{{ t('combinedProjectName') }}</label>
        <Input
          id="combined-project-name"
          v-model="combinedName"
          :placeholder="t('projectName')"
          :disabled="busy"
          @input="isNameManuallyEdited = true"
        />
      </div>

      <div class="combine-section">
        <label class="combine-section-label">{{ t('combineMode') }}</label>
        <div class="mode-options" role="radiogroup">
          <button
            type="button"
            class="mode-card"
            :class="{ 'is-selected': combineMode === 'copy' }"
            role="radio"
            :aria-checked="combineMode === 'copy'"
            :disabled="busy"
            @click="combineMode = 'copy'"
          >
            <div class="mode-card-header">
              <Copy class="mode-icon" />
              <span class="mode-title">{{ t('combineKeepOriginals') }}</span>
            </div>
            <p class="mode-desc">{{ t('combineKeepOriginalsDesc') }}</p>
          </button>

          <button
            type="button"
            class="mode-card danger"
            :class="{ 'is-selected': combineMode === 'delete' }"
            role="radio"
            :aria-checked="combineMode === 'delete'"
            :disabled="busy"
            @click="combineMode = 'delete'"
          >
            <div class="mode-card-header">
              <Trash2 class="mode-icon danger-icon" />
              <span class="mode-title">{{ t('combineDeleteOriginals') }}</span>
            </div>
            <p class="mode-desc">{{ t('combineDeleteOriginalsDesc') }}</p>
          </button>
        </div>
      </div>

      <p v-if="error" class="combine-error" role="alert">{{ error }}</p>
    </div>

    <template #footer="{ close }">
      <div class="combine-footer-actions">
        <Button variant="ghost" size="sm" :disabled="busy" @click="close">
          {{ t('cancel') }}
        </Button>
        <Button
          variant="primary"
          size="sm"
          :icon="Layers"
          :loading="busy"
          :disabled="orderedProjects.length < 2 || busy"
          @click="handleSubmit"
        >
          {{ t('combine') }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped src="./project-combine-dialog.css" />
