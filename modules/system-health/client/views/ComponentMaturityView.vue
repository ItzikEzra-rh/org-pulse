<script setup>
import { ref, inject, watch } from 'vue'
import DisconnectedReadinessContent from './DisconnectedReadinessContent.vue'
import ComponentMaturityContent from './ComponentMaturityContent.vue'

const nav = inject('moduleNav')
const activeTab = ref(nav.params.value?.tab || 'maturity')

watch(() => nav.params.value?.tab, (tab) => {
  if (tab) activeTab.value = tab
})
const tabs = [
  { id: 'maturity', label: 'Component maturity' },
  { id: 'disconnected', label: 'Disconnected readiness' }
]
</script>

<template>
  <div class="flex flex-col -mx-6 -my-6 lg:-mx-8" style="min-height: calc(100vh - 4rem)">
    <div class="px-6 lg:px-8 pt-3 bg-white dark:bg-gray-800 shrink-0">
      <div class="flex items-center justify-between gap-4 mb-3">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Component maturity</h1>
      </div>
      <nav class="flex gap-6 border-b border-gray-200 dark:border-gray-700" aria-label="Component maturity tabs">
        <button
          v-for="tab in tabs" :key="tab.id"
          @click="activeTab = tab.id"
          class="pb-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.id
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'"
        >{{ tab.label }}</button>
      </nav>
    </div>

    <div v-if="activeTab === 'maturity'" class="flex-1 overflow-y-auto bg-[#f4f4f4] px-6 py-6 lg:px-8">
      <ComponentMaturityContent />
    </div>
    <div v-else class="flex-1 px-6 lg:px-8 py-6 overflow-y-auto">
      <DisconnectedReadinessContent />
    </div>
  </div>
</template>
