<script setup>
import { computed } from 'vue'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

const projectId = useProjectId()
const aiCommitsProxyUrl = computed(() => (
  `/api/modules/ai-impact/ai-commits-proxy${projectQuery(projectId.value)}`
))
</script>

<template>
  <div class="flex flex-col -mx-6 -my-6 lg:-mx-8" style="min-height: calc(100vh - 4rem)">
    <div class="px-6 lg:px-8 pt-3 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Commits</h1>
        <a
          :href="aiCommitsProxyUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >Open in new tab</a>
      </div>
    </div>

    <iframe
      :src="aiCommitsProxyUrl"
      title="AI Commits Scanner"
      sandbox="allow-scripts allow-same-origin"
      class="w-full flex-1 border-0 block min-h-0"
      style="height: calc(100vh - 9rem)"
    />
  </div>
</template>
