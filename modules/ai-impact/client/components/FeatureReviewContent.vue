<script setup>
import LoadingOverlay from '@shared/client/components/LoadingOverlay.vue'
import FeatureMetricsRow from './FeatureMetricsRow.vue'
import FeatureCharts from './FeatureCharts.vue'
import FeatureList from './FeatureList.vue'
import TrendCharts from './TrendCharts.vue'

defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  features: { type: Object, default: () => ({}) },
  featureMeta: { type: Object, default: () => ({}) },
  trendData: { type: Array, default: () => [] },
  breakdown: { type: Array, default: () => [] },
  timeWindow: { type: String, default: 'month' },
  chartExpanded: { type: Boolean, default: true },
  searchQuery: { type: String, default: '' },
  aiInvolvementFilter: { type: String, default: 'all' },
  recommendationFilter: { type: String, default: 'all' },
  priorityFilter: { type: String, default: 'all' },
  humanReviewFilter: { type: String, default: 'all' },
  componentFilter: { type: String, default: 'all' },
  artifactFilter: { type: String, default: 'all' },
  sortBy: { type: String, default: 'default' },
  selectedFeature: { type: Object, default: null }
})

const emit = defineEmits([
  'update:timeWindow',
  'update:chartExpanded',
  'update:searchQuery',
  'update:aiInvolvementFilter',
  'update:recommendationFilter',
  'update:priorityFilter',
  'update:humanReviewFilter',
  'update:componentFilter',
  'update:artifactFilter',
  'update:sortBy',
  'selectFeature',
  'retry'
])
</script>

<template>
  <main class="flex-1 flex flex-col overflow-auto">
    <!-- Top Bar -->
    <header class="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3 shrink-0 flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold dark:text-gray-100">Design Review</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">AI adoption metrics and design tracking</p>
      </div>
      <div class="flex items-center gap-2">
        <label for="design-time-window" class="text-sm text-gray-500 dark:text-gray-400">Showing:</label>
        <select
          id="design-time-window"
          :value="timeWindow"
          @change="emit('update:timeWindow', $event.target.value)"
          class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="3months">Last 3 Months</option>
        </select>
      </div>
    </header>

    <!-- Loading -->
    <LoadingOverlay v-if="loading" message="Loading design reviews..." />

    <!-- Error -->
    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center">
      <div class="text-red-500 dark:text-red-400 mb-2">Failed to load design review data</div>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ error }}</p>
      <button
        @click="emit('retry')"
        class="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700"
      >
        Retry
      </button>
    </div>

    <!-- Empty state -->
    <div v-else-if="Object.keys(features).length === 0" class="flex-1 flex flex-col items-center justify-center">
      <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
        <svg class="h-8 w-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold mb-2 dark:text-gray-100">No Design Reviews Yet</h2>
      <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
        Design review data will appear here once the pipeline pushes results.
      </p>
    </div>

    <!-- Data loaded -->
    <template v-else>
      <FeatureMetricsRow :features="features" />
      <TrendCharts
        :trendData="trendData"
        :breakdown="breakdown"
        :expanded="chartExpanded"
        :timeWindow="timeWindow"
        itemLabel="design docs"
        @toggle="emit('update:chartExpanded', !chartExpanded)"
      />
      <FeatureCharts :features="features" />
      <FeatureList
        :features="features"
        :selectedFeature="selectedFeature"
        :searchQuery="searchQuery"
        :aiInvolvementFilter="aiInvolvementFilter"
        :recommendationFilter="recommendationFilter"
        :priorityFilter="priorityFilter"
        :humanReviewFilter="humanReviewFilter"
        :componentFilter="componentFilter"
        :artifactFilter="artifactFilter"
        :sortBy="sortBy"
        @update:searchQuery="emit('update:searchQuery', $event)"
        @update:aiInvolvementFilter="emit('update:aiInvolvementFilter', $event)"
        @update:recommendationFilter="emit('update:recommendationFilter', $event)"
        @update:priorityFilter="emit('update:priorityFilter', $event)"
        @update:humanReviewFilter="emit('update:humanReviewFilter', $event)"
        @update:componentFilter="emit('update:componentFilter', $event)"
        @update:artifactFilter="emit('update:artifactFilter', $event)"
        @update:sortBy="emit('update:sortBy', $event)"
        @selectFeature="emit('selectFeature', $event)"
      />
    </template>
  </main>
</template>
