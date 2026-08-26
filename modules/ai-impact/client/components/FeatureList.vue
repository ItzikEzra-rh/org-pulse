<script setup>
import { computed } from 'vue'
import FeatureListItem from './FeatureListItem.vue'

const props = defineProps({
  features: { type: Object, default: () => ({}) },
  selectedFeature: { type: Object, default: null },
  searchQuery: { type: String, default: '' },
  recommendationFilter: { type: String, default: 'all' },
  priorityFilter: { type: String, default: 'all' },
  humanReviewFilter: { type: String, default: 'all' },
  componentFilter: { type: String, default: 'all' },
  sortBy: { type: String, default: 'default' }
})

const emit = defineEmits([
  'update:searchQuery',
  'update:recommendationFilter',
  'update:priorityFilter',
  'update:humanReviewFilter',
  'update:componentFilter',
  'update:sortBy',
  'selectFeature'
])

const featureList = computed(() => Object.values(props.features))

const availablePriorities = computed(() => {
  const values = new Set()
  for (const f of featureList.value) {
    if (f.priority) values.add(f.priority)
  }
  return [...values].sort()
})

const availableComponents = computed(() => {
  const values = new Set()
  for (const f of featureList.value) {
    for (const c of (f.components || [])) values.add(c)
  }
  return [...values].sort()
})

const sortedAndFilteredFeatures = computed(() => {
  let items = [...featureList.value]

  // Search filter
  const q = props.searchQuery.toLowerCase()
  if (q) {
    items = items.filter(f =>
      f.key.toLowerCase().includes(q) ||
      f.title.toLowerCase().includes(q) ||
      f.sourceRfe.toLowerCase().includes(q)
    )
  }

  // Recommendation filter
  if (props.recommendationFilter === 'no-design') {
    items = items.filter(f => f.designStatus === 'no-design')
  } else if (props.recommendationFilter !== 'all') {
    items = items.filter(f => f.recommendation === props.recommendationFilter)
  }

  // Priority filter
  if (props.priorityFilter !== 'all') {
    items = items.filter(f => f.priority === props.priorityFilter)
  }

  // Review status filter
  if (props.humanReviewFilter !== 'all') {
    items = items.filter(f => f.humanReviewStatus === props.humanReviewFilter)
  }

  // Component filter
  if (props.componentFilter !== 'all') {
    items = items.filter(f => (f.components || []).includes(props.componentFilter))
  }

  // Sort
  if (props.sortBy === 'score-low') {
    items.sort((a, b) => (a.scores?.total || 0) - (b.scores?.total || 0))
  } else if (props.sortBy === 'score-high') {
    items.sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0))
  }
  // default: by key (natural order from Object.values)

  return items
})
</script>

<template>
  <div class="p-6">
    <h3 class="font-medium dark:text-gray-200 flex items-center gap-2 mb-4">
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
      Design List
      <span class="text-sm font-normal text-gray-500 dark:text-gray-400">({{ sortedAndFilteredFeatures.length }} of {{ featureList.length }} total)</span>
    </h3>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4">
      <input
        :value="searchQuery"
        @input="emit('update:searchQuery', $event.target.value)"
        type="text"
        placeholder="Search by key, title, or source PRD..."
        class="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
      />

      <select
        :value="recommendationFilter"
        @change="emit('update:recommendationFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All AI Recommendations</option>
        <option value="approve">AI Recommendation: Approve</option>
        <option value="revise">AI Recommendation: Needs Revision</option>
        <option value="reject">AI Recommendation: Reject</option>
        <option value="no-design">No Design Doc</option>
      </select>

      <select
        :value="priorityFilter"
        @change="emit('update:priorityFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All Priorities</option>
        <option v-for="p in availablePriorities" :key="p" :value="p">{{ p }}</option>
      </select>

      <select
        :value="humanReviewFilter"
        @change="emit('update:humanReviewFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All Review Status</option>
        <option value="approved">Approved</option>
        <option value="awaiting-review">Awaiting Sign-off</option>
        <option value="needs-review">Flagged</option>
      </select>

      <select
        :value="componentFilter"
        @change="emit('update:componentFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All Components</option>
        <option v-for="c in availableComponents" :key="c" :value="c">{{ c }}</option>
      </select>

      <select
        :value="sortBy"
        @change="emit('update:sortBy', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="default">Sort: Default</option>
        <option value="score-low">Score: Low to High</option>
        <option value="score-high">Score: High to Low</option>
      </select>
    </div>

    <!-- Feature list -->
    <div class="space-y-2">
      <FeatureListItem
        v-for="feature in sortedAndFilteredFeatures"
        :key="feature.key"
        :feature="feature"
        :selected="selectedFeature?.key === feature.key"
        @select="emit('selectFeature', $event)"
      />
      <div v-if="sortedAndFilteredFeatures.length === 0" class="text-center text-gray-400 dark:text-gray-500 py-8">
        No features match the current filters.
      </div>
    </div>
  </div>
</template>
