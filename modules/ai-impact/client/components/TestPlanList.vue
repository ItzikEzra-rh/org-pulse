<script setup>
import { computed } from 'vue'
import TestPlanListItem from './TestPlanListItem.vue'
import { REVIEW_STATUS_FILTER_OPTIONS, SORT_FILTER_OPTIONS } from '../utils/feature-helpers.js'
import { normalizeTestPlanReviewStatus } from '../utils/test-plan-helpers.js'

const props = defineProps({
  testPlans: { type: Object, default: () => ({}) },
  selectedPlan: { type: Object, default: null },
  searchQuery: { type: String, default: '' },
  verdictFilter: { type: String, default: 'all' },
  humanReviewFilter: { type: String, default: 'all' },
  priorityFilter: { type: String, default: 'all' },
  componentFilter: { type: String, default: 'all' },
  sortBy: { type: String, default: 'default' }
})

const emit = defineEmits([
  'update:searchQuery',
  'update:verdictFilter',
  'update:humanReviewFilter',
  'update:priorityFilter',
  'update:componentFilter',
  'update:sortBy',
  'selectPlan'
])

const planList = computed(() => Object.values(props.testPlans))
const availablePriorities = computed(() => [...new Set(planList.value.map(p => p.jiraPriority).filter(Boolean))].sort())
const availableComponents = computed(() => [...new Set(planList.value.flatMap(p => p.components || []))].sort())

const sortedAndFilteredPlans = computed(() => {
  let items = [...planList.value]

  // Search filter
  const q = props.searchQuery.toLowerCase()
  if (q) {
    items = items.filter(p =>
      (p.key || '').toLowerCase().includes(q) ||
      (p.sourceKey || '').toLowerCase().includes(q) ||
      (p.feature || p.featureName || p.title || '').toLowerCase().includes(q) ||
      (p.components || []).some(c => c.toLowerCase().includes(q))
    )
  }

  // Verdict filter
  if (props.verdictFilter !== 'all') {
    items = items.filter(p => p.verdict === props.verdictFilter)
  }
  if (props.humanReviewFilter !== 'all') {
    items = items.filter(p => normalizeTestPlanReviewStatus(p.humanReviewStatus) === props.humanReviewFilter)
  }
  if (props.priorityFilter !== 'all') {
    items = items.filter(p => p.jiraPriority === props.priorityFilter)
  }
  if (props.componentFilter !== 'all') {
    items = items.filter(p => (p.components || []).includes(props.componentFilter))
  }

  // Sort
  if (props.sortBy === 'score-asc') {
    items.sort((a, b) => (a.score ?? -1) - (b.score ?? -1))
  } else if (props.sortBy === 'score-desc') {
    items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  } else if (props.sortBy === 'newest') {
    items.sort((a, b) => new Date(b.reviewedAt || 0) - new Date(a.reviewedAt || 0))
  } else if (props.sortBy === 'oldest') {
    items.sort((a, b) => new Date(a.reviewedAt || 0) - new Date(b.reviewedAt || 0))
  }
  // default: by key (natural order from Object.values)

  return items
})
</script>

<template>
  <div class="p-6">
    <h3 class="font-medium dark:text-gray-200 flex items-center gap-2 mb-4">
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
      Test Plan List
      <span class="text-sm font-normal text-gray-500 dark:text-gray-400">({{ sortedAndFilteredPlans.length }} of {{ planList.length }} total)</span>
    </h3>
    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4">
      <input
        :value="searchQuery"
        @input="emit('update:searchQuery', $event.target.value)"
        type="text"
        placeholder="Search by key, feature name, or component..."
        class="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
      />

      <select
        :value="verdictFilter"
        @change="emit('update:verdictFilter', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="all">All AI Recommendations</option>
        <option value="Ready">AI Recommendation: Ready</option>
        <option value="Revise">AI Recommendation: Revise</option>
        <option value="Rework">AI Recommendation: Rework</option>
      </select>

      <select :value="humanReviewFilter" @change="emit('update:humanReviewFilter', $event.target.value)" class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300">
        <option v-for="o in REVIEW_STATUS_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <select :value="priorityFilter" @change="emit('update:priorityFilter', $event.target.value)" class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300">
        <option value="all">All Priorities</option>
        <option v-for="priority in availablePriorities" :key="priority" :value="priority">{{ priority }}</option>
      </select>

      <select :value="componentFilter" @change="emit('update:componentFilter', $event.target.value)" class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300">
        <option value="all">All Components</option>
        <option v-for="component in availableComponents" :key="component" :value="component">{{ component }}</option>
      </select>

      <select
        :value="sortBy"
        @change="emit('update:sortBy', $event.target.value)"
        class="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
      >
        <option v-for="o in SORT_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>

    <!-- Plan list -->
    <div class="space-y-2">
      <TestPlanListItem
        v-for="plan in sortedAndFilteredPlans"
        :key="plan.key"
        :plan="plan"
        :selected="selectedPlan?.key === plan.key"
        @select="emit('selectPlan', $event)"
      />
      <div v-if="sortedAndFilteredPlans.length === 0" class="text-center text-gray-400 dark:text-gray-500 py-8">
        No test plans match the current filters.
      </div>
    </div>
  </div>
</template>
