<template>
  <div>
    <!-- Permission guard -->
    <div v-if="!hasAccess" class="text-center py-16">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
      <p class="text-gray-500 dark:text-gray-400">You don't have permission to view this page. The planning-manager role is required.</p>
    </div>

    <template v-else>
    <!-- Tab bar -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex -mb-px px-4" aria-label="Manage sub-tabs">
        <button
          v-for="tab in manageTabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.id
            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Hygiene Rules tab -->
    <div v-if="activeTab === 'hygiene'" class="p-6">
      <HygieneConfigView />
    </div>

    <!-- Releases tab -->
    <div v-else class="max-w-4xl mx-auto py-6 px-4">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Release Registry</h1>
      <div class="flex items-center gap-3">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search releases..."
          class="w-64 pl-4 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>
    </div>

    <!-- Product filter -->
    <div v-if="products.length > 1" class="flex flex-wrap gap-2 mb-4">
      <button
        @click="selectedProduct = null"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
        :class="!selectedProduct
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-gray-600'"
      >
        All
      </button>
      <button
        v-for="product in products"
        :key="product"
        @click="selectedProduct = product"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
        :class="selectedProduct === product
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-gray-600'"
      >
        {{ product }}
      </button>
    </div>

    <!-- Show archived toggle -->
    <div class="flex items-center gap-2 mb-4">
      <input
        id="show-archived"
        type="checkbox"
        v-model="showArchived"
        class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
      />
      <label for="show-archived" class="text-sm text-gray-600 dark:text-gray-400">Show archived</label>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">Loading releases...</div>

    <!-- Empty state -->
    <div
      v-else-if="releases.length === 0"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <div class="text-gray-400 dark:text-gray-500 mb-4">
        <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No releases yet</h3>
      <p class="text-gray-500 dark:text-gray-400">The release registry is empty.</p>
    </div>

    <!-- No matches for current filter -->
    <div
      v-else-if="filteredReleases.length === 0"
      class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No matching releases</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">Try a different product filter or enable "Show archived".</p>
    </div>

    <!-- Release cards -->
    <div v-else class="space-y-4">
      <div
        v-for="release in filteredReleases"
        :key="release.id"
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
      >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ release.displayName || release.id }}</h2>
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="release.state === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'"
                >
                  {{ release.state }}
                </span>
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="sourceBadgeClass(release.source)"
                >
                  {{ sourceLabel(release.source) }}
                </span>
              </div>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">{{ release.id }}</p>

              <!-- Fix versions -->
              <div v-if="release.fixVersions?.length" class="flex flex-wrap gap-1.5 mb-3">
                <span
                  v-for="fv in release.fixVersions"
                  :key="fv"
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  {{ fv }}
                </span>
              </div>

              <!-- Product Pages info -->
              <p v-if="release.productPagesShortname" class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Product Pages: {{ release.productPagesShortname }}{{ release.productPagesVersion ? ' / ' + release.productPagesVersion : '' }}
              </p>

              <!-- Milestones -->
              <div v-if="release.milestones && Object.keys(release.milestones).length > 0" class="mb-3">
                <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div v-for="[key, value] in sortedMilestones(release.milestones)" :key="key" class="flex items-center gap-1.5">
                    <span class="text-gray-500 dark:text-gray-400">{{ formatMilestoneLabel(key) }}:</span>
                    <span class="text-gray-900 dark:text-gray-100">{{ value }}</span>
                  </div>
                </div>
              </div>

              <!-- Timestamps -->
              <p class="text-xs text-gray-400 dark:text-gray-500">
                Created: {{ formatDate(release.createdAt) }}
                <span v-if="release.updatedAt"> &middot; Updated: {{ formatDate(release.updatedAt) }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch, inject } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useAuth } from '@shared/client/composables/useAuth.js'
import HygieneConfigView from '../components/HygieneConfigView.vue'

const nav = inject('moduleNav')

const manageTabs = [
  { id: 'releases', label: 'Releases' },
  { id: 'hygiene', label: 'Hygiene Rules' },
]

const VALID_MANAGE_TABS = manageTabs.map(t => t.id)
const DEFAULT_MANAGE_TAB = 'releases'

const activeTab = ref(DEFAULT_MANAGE_TAB)

let updatingFromUrl = false

watch(activeTab, (tab) => {
  if (!updatingFromUrl) {
    nav.updateParams({ tab: tab === DEFAULT_MANAGE_TAB ? undefined : tab })
  }
})

watch(() => nav.params.value?.tab, (tabParam) => {
  const tab = tabParam && VALID_MANAGE_TABS.includes(tabParam) ? tabParam : DEFAULT_MANAGE_TAB
  if (activeTab.value !== tab) {
    updatingFromUrl = true
    activeTab.value = tab
    nextTick(() => { updatingFromUrl = false })
  }
}, { immediate: true })

const { isAdmin, roles: userRoles } = useAuth()
const hasAccess = computed(() => isAdmin.value || userRoles.value.includes('planning-manager'))

const releases = ref([])
const loading = ref(true)
const showArchived = ref(false)
const selectedProduct = ref(null)
const searchQuery = ref('')
const projectId = computed(() => nav.params.value?.projectId || '')
let requestSequence = 0

const KNOWN_MILESTONES = ['codeFreeze', 'ea1', 'ga']

function getProduct(release) {
  if (release.productPagesShortname) return release.productPagesShortname
  const match = release.id.match(/^([a-z]+)-/)
  return match ? match[1] : release.id
}

const products = computed(() => {
  const set = new Set(releases.value.map(getProduct))
  return [...set].sort()
})

const filteredReleases = computed(() => {
  let result = releases.value
  if (!showArchived.value) result = result.filter(r => r.state !== 'archived')
  if (selectedProduct.value) result = result.filter(r => getProduct(r) === selectedProduct.value)
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter(r =>
      r.id.toLowerCase().includes(q) ||
      (r.displayName || '').toLowerCase().includes(q) ||
      (r.fixVersions || []).some(fv => fv.toLowerCase().includes(q))
    )
  }
  return result
})

async function fetchReleases() {
  const sequence = ++requestSequence
  loading.value = true
  releases.value = []
  const suffix = projectId.value ? `?projectId=${encodeURIComponent(projectId.value)}` : ''
  try {
    const data = await apiRequest(`/modules/releases/registry${suffix}`)
    if (sequence !== requestSequence) return
    releases.value = data.releases || []
  } catch (e) {
    if (sequence !== requestSequence) return
    console.error('Failed to fetch releases:', e)
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(projectId, () => {
  selectedProduct.value = null
  searchQuery.value = ''
  if (hasAccess.value) fetchReleases()
})

function formatMilestoneLabel(key) {
  const labels = { codeFreeze: 'Code Freeze', ea1: 'EA1', ga: 'GA' }
  return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

function sortedMilestones(milestones) {
  return Object.entries(milestones).sort(([a], [b]) => {
    const order = [...KNOWN_MILESTONES]
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

function sourceLabel(source) {
  if (source === 'product-pages') return 'Product Pages'
  if (source === 'jira') return 'Jira'
  return 'Manual'
}

function sourceBadgeClass(source) {
  if (source === 'product-pages') return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
  if (source === 'jira') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
  return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
}

onMounted(() => {
  if (hasAccess.value) fetchReleases()
})
</script>
