<script setup lang="ts">
import { ArrowUpDown, Check } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { SORT_OPTIONS } from './useProjectSort';
import type { ProjectSortOption } from './project-sort-types';

const props = defineProps<{
  modelValue: ProjectSortOption;
}>();

const emit = defineEmits<{
  'update:modelValue': [sort: ProjectSortOption];
}>();

const { t } = useTranslate('ProjectPicker');

const selectSort = (key: ProjectSortOption, close: () => void) => {
  emit('update:modelValue', key);
  close();
};
</script>

<template>
  <Popover align="right" direction="down" :match-trigger-width="false">
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="xs"
        class="sort-toggle-button"
        :class="{ 'is-active': isOpen || modelValue !== 'date-desc' }"
        :icon="ArrowUpDown"
        icon-only
        :aria-label="t('sortProjects')"
        :tooltip="t('sortProjects')"
      />
    </template>
    <template #default="{ close }">
      <div class="project-sort-menu" role="menu">
        <button
          v-for="option in SORT_OPTIONS"
          :key="option.key"
          type="button"
          class="sort-menu-item"
          :class="{ 'is-active': modelValue === option.key }"
          role="menuitemradio"
          :aria-checked="modelValue === option.key"
          @click="selectSort(option.key, close)"
        >
          <span class="sort-item-check" aria-hidden="true">
            <Check v-if="modelValue === option.key" class="check-icon" />
          </span>
          <span class="sort-item-label">{{ t(option.labelKey) }}</span>
        </button>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.project-sort-menu {
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 190px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  gap: 2px;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.sort-menu-item:hover,
.sort-menu-item:focus-visible {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-text-emphasis, #ffffff);
  outline: none;
}

.sort-menu-item.is-active {
  color: var(--color-primary, #6366f1);
  font-weight: 500;
}

.sort-item-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.check-icon {
  width: 14px;
  height: 14px;
  color: currentColor;
}

.sort-item-label {
  flex: 1;
  white-space: nowrap;
}
</style>
