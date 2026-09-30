<script setup>
import { computed } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import OsacBuildsView from './OsacBuildsView.vue'
import ProjectBuildsView from './ProjectBuildsView.vue'

// OSAC keeps its legacy builds source; every other project reads its own
// project-qualified build registry through the capability-driven publication
// route.
const projectId = useProjectId()
const isOsac = computed(() => !projectId.value || projectId.value === 'osac')
</script>

<template>
  <OsacBuildsView v-if="isOsac" />
  <ProjectBuildsView v-else />
</template>
