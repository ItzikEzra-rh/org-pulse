<script setup>
import { computed } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import ProjectDesignDocsView from '../components/ProjectDesignDocsView.vue'
import OsacDocumentationView from './OsacDocumentationView.vue'
import AIImpactGuide from '../components/AIImpactGuide.vue'

// Only the selected project gets mounted. The OSAC data composables are not
// started while another project's design-doc evidence is being displayed.
const projectId = useProjectId()
const isOsac = computed(() => !projectId.value || projectId.value === 'osac')
</script>

<template>
  <div class="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
    <OsacDocumentationView v-if="isOsac" />
    <ProjectDesignDocsView v-if="!isOsac" />
    <AIImpactGuide defaultTab="enablement" />
  </div>
</template>
