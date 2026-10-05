<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useAuditLog } from '../plan/composables/useAuditLog'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

const { entries, total, loading, error, loadAuditLog } = useAuditLog()
const projectId = useProjectId()

const filters = ref({
  domain: '',
  version: '',
  action: '',
  limit: 50,
  offset: 0
})

let debounceTimer = null

onMounted(function() { loadAuditLog(filters.value) })
watch(projectId, function() {
  filters.value.offset = 0
  loadAuditLog(filters.value)
}, { flush: 'sync' })
onUnmounted(function() { clearTimeout(debounceTimer) })

function applyFilters() {
  filters.value.offset = 0
  loadAuditLog(filters.value)
}

function debouncedApply() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(applyFilters, 300)
}

function nextPage() {
  filters.value.offset += filters.value.limit
  loadAuditLog(filters.value)
}

function prevPage() {
  filters.value.offset = Math.max(0, filters.value.offset - filters.value.limit)
  loadAuditLog(filters.value)
}

const ACTION_LABELS = {
  create_rock: 'Big Rock Created',
  update_rock: 'Big Rock Updated',
  delete_rock: 'Big Rock Deleted',
  reorder_rocks: 'Big Rocks Reordered',
  create_release: 'Release Created',
  clone_release: 'Release Cloned',
  delete_release: 'Release Deleted',
  import_doc: 'Doc Imported',
  add_pm: 'PM Added',
  remove_pm: 'PM Removed',
  seed: 'Data Seeded',
  registry_create: 'Registry Created',
  registry_update: 'Registry Updated',
  manual_refresh: 'Manual Refresh',
  config_save: 'Config Saved',
  config_update: 'Config Updated',
  set_override: 'Override Set',
  remove_override: 'Override Removed',
  commit_snapshot: 'Snapshot Committed',
  health_refresh: 'Health Refreshed',
  delivery_refresh: 'Delivery Refreshed',
  upload_releases: 'Releases Uploaded',
  conforma_bulk: 'Conforma Updated'
}

const DOMAIN_LABELS = {
  planning: 'Planning',
  execution: 'Execution',
  delivery: 'Delivery',
  registry: 'Registry'
}

const DOMAIN_COLORS = {
  planning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  execution: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  delivery: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  registry: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
}

function formatDate(ts) {
  return new Date(ts).toLocaleString()
}

function shortUser(email) {
  if (!email) return 'System'
  const at = email.indexOf('@')
  return at > 0 ? email.substring(0, at) : email
}
</script>

<template>
  <div class="max-w-6xl mx-auto py-6 px-4">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Audit Log</h1>

    <!-- Filters -->
    <div class="flex items-end gap-4 flex-wrap mb-6">
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Domain</label>
        <select
          v-model="filters.domain"
          class="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 h-[38px] px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          @change="applyFilters"
        >
          <option value="">All Domains</option>
          <option v-for="(label, key) in DOMAIN_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div class="w-48">
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Version</label>
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="filters.version"
            type="text"
            placeholder="e.g. 2.18"
            class="block w-full pl-10 pr-4 h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            @input="debouncedApply"
          >
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Action</label>
        <select
          v-model="filters.action"
          class="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 h-[38px] px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          @change="applyFilters"
        >
          <option value="">All Actions</option>
          <option v-for="(label, key) in ACTION_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400 py-4">Loading...</div>

    <!-- Error -->
    <div v-else-if="error" class="text-sm text-red-600 dark:text-red-400 py-4">{{ error }}</div>

    <!-- Results -->
    <div v-else>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Domain</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Version</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="entry in entries" :key="entry.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ formatDate(entry.timestamp) }}</td>
              <td class="px-4 py-3 text-sm whitespace-nowrap">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  :class="DOMAIN_COLORS[entry.domain] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
                >{{ DOMAIN_LABELS[entry.domain] || entry.domain }}</span>
              </td>
              <td class="px-4 py-3 text-sm">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {{ ACTION_LABELS[entry.action] || entry.action }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ shortUser(entry.user) }}</td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ entry.version || '--' }}</td>
              <td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-200">{{ entry.summary }}</td>
            </tr>
            <tr v-if="entries.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">No audit log entries</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="total > filters.limit" class="flex items-center justify-between mt-3">
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Showing {{ filters.offset + 1 }}-{{ Math.min(filters.offset + filters.limit, total) }} of {{ total }}
        </span>
        <div class="flex gap-2">
          <button
            class="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            :disabled="filters.offset === 0"
            @click="prevPage"
          >Prev</button>
          <button
            class="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            :disabled="filters.offset + filters.limit >= total"
            @click="nextPage"
          >Next</button>
        </div>
      </div>
    </div>
  </div>
</template>
