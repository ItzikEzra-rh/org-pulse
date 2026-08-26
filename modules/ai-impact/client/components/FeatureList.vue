<script setup>
import { computed } from 'vue'
import FeatureListItem from './FeatureListItem.vue'
import {
  AI_INVOLVEMENT_FILTER_OPTIONS, REVIEW_STATUS_FILTER_OPTIONS,
  SORT_FILTER_OPTIONS, getArtifactFilterOptions
} from '../utils/feature-helpers.js'

const artifactFilterOptions = getArtifactFilterOptions('Design')

const props = defineProps({
  features: { type: Object, default: () => ({}) },
  selectedFeature: { type: Object, default: null },
  searchQuery: { type: String, default: '' },
  aiInvolvementFilter: { type: String, default: 'all' },
  recommendationFilter: { type: String, default: 'all' },
  priorityFilter: { type: String, default: 'all' },
  humanReviewFilter: { type: String, default: 'all' },
  componentFilter: { type: String, default: 'all' },
  artifactFilter: { type: String, default: 'all' },
  sortBy: { type: String, default: 'default' }
})

const emit = defineEmits([
  'update:searchQuery',
  'update:aiInvolvementFilter',
  'update:recommendationFilter',
  'update:priorityFilter',
  'update:humanReviewFilter',
  'update:componentFilter',
  'update:artifactFilter',
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

  // AI involvement filter
  if (props.aiInvolvementFilter !== 'all') {
    items = items.filter(f => f.aiInvolvement === props.aiInvolvementFilter)
  }

  // AI verdict filter (the AI review's recommendation)
  if (props.recommendationFilter === 'not-reviewed') {
    items = items.filter(f => f.recommendation == null && f.designStatus !== 'no-design')
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

  // Artifact filter (whether the design doc exists at all)
  if (props.artifactFilter === 'has') {
    items = items.filter(f => f.designStatus !== 'no-design')
  } else if (props.artifactFilter === 'missing') {
    items = items.filter(f => f.designStatus === 'no-design')
  }

  // Sort
  if (props.sortBy === 'score-asc') {
    items.sort((a, b) => (a.scores?.total || 0) - (b.scores?.total || 0))
  } else if (props.sortBy === 'score-desc') {
    items.sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0))
  } else if (props.sortBy === 'newest') {
    items.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))
  } else if (props.sortBy === 'oldest') {
    items.sort((a, b) => new Date(a.created || 0) - new Date(b.created || 0))
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
        :value="aiInvolvementFilter"
        @change="emit('update:aiInvolvementFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option v-for="o in AI_INVOLVEMENT_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <select
        :value="recommendationFilter"
        @change="emit('update:recommendationFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All AI Verdicts</option>
        <option value="approve">Approve</option>
        <option value="revise">Needs Revision</option>
        <option value="reject">Reject</option>
        <option value="not-reviewed">Not Reviewed</option>
      </select>

      <select
        :value="humanReviewFilter"
        @change="emit('update:humanReviewFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option v-for="o in REVIEW_STATUS_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
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
        :value="componentFilter"
        @change="emit('update:componentFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All Components</option>
        <option v-for="c in availableComponents" :key="c" :value="c">{{ c }}</option>
      </select>

      <select
        :value="artifactFilter"
        @change="emit('update:artifactFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option v-for="o in artifactFilterOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <select
        :value="sortBy"
        @change="emit('update:sortBy', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option v-for="o in SORT_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
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
