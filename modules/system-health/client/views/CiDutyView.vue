<script setup>
import { onMounted } from 'vue'
import { ClockIcon, CalendarDaysIcon } from 'lucide-vue-next'
import { useCiDuty, formatDutyDate, getInitials } from '../composables/useCiDuty.js'
import WorkgroupBadge from '../components/ci-duty/WorkgroupBadge.vue'

const { loading, error, notFound, inapplicable, unavailable, load, currentEntry, nextEntry, rotation, workgroupColors } = useCiDuty()

onMounted(load)

function retry() {
  load()
}
</script>

<template>
  <div class="max-w-4xl mx-auto py-6 px-4 space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">CI Duty</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Current and upcoming CI duty rotation</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div v-for="i in 2" :key="i" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 sm:p-6 animate-pulse">
          <div class="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full mb-4" />
          <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700/50"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Failed to load CI Duty roster</h3>
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <button
        @click="retry"
        class="mt-4 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >Try again</button>
    </div>

    <!-- Project disposition -->
    <div
      v-else-if="inapplicable"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">CI Duty is not applicable</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">The CI Duty rotation is configured for OSAC.</p>
    </div>

    <div
      v-else-if="unavailable"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">CI Duty unavailable</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">Select a project from the top bar to load its CI Duty status.</p>
    </div>

    <!-- Missing data -->
    <div
      v-else-if="notFound"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No CI Duty roster available</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">Waiting for org-pulse-data to deliver the CI Duty roster.</p>
    </div>

    <template v-else>
      <section class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <!-- Current duty -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 border-l-primary-500 bg-primary-50/40 dark:bg-primary-500/5 p-5 sm:p-6">
          <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400">
            <span class="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
            Current
          </span>
          <template v-if="currentEntry">
            <div class="flex items-center gap-4 mt-4">
              <div class="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-900/50 ring-2 ring-primary-200 dark:ring-primary-800/60 flex items-center justify-center text-base font-semibold text-primary-700 dark:text-primary-300 shrink-0">
                {{ getInitials(currentEntry.lead) }}
              </div>
              <div class="min-w-0">
                <p class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{{ currentEntry.lead }}</p>
                <WorkgroupBadge class="mt-1.5" :workgroup="currentEntry.workgroup" :color-class="workgroupColors[currentEntry.workgroup]" />
              </div>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-4">
              {{ formatDutyDate(currentEntry.startDate) }} – {{ formatDutyDate(currentEntry.endDate) }}
            </p>
          </template>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400 mt-4">No one is currently on CI Duty.</p>
        </div>

        <!-- Up next -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <ClockIcon class="w-3.5 h-3.5" />
            Up Next
          </span>
          <template v-if="nextEntry">
            <div class="flex items-center gap-3 mt-4">
              <div class="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">
                {{ getInitials(nextEntry.lead) }}
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ nextEntry.lead }}</p>
                <WorkgroupBadge class="mt-1.5" :workgroup="nextEntry.workgroup" :color-class="workgroupColors[nextEntry.workgroup]" />
              </div>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-4">
              {{ formatDutyDate(nextEntry.startDate) }} – {{ formatDutyDate(nextEntry.endDate) }}
            </p>
          </template>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400 mt-4">No upcoming duty scheduled.</p>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <h2 class="px-5 pt-4 pb-2 text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CalendarDaysIcon class="w-4 h-4 text-gray-400 dark:text-gray-500" />
          Upcoming Rotation
        </h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
              <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase"></th>
              <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Lead</th>
              <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Workgroup</th>
              <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Start</th>
              <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">End</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in rotation"
              :key="`${entry.lead}-${entry.startDate}`"
              class="border-b border-gray-100 dark:border-gray-800 last:border-0"
              :class="entry === currentEntry ? 'bg-primary-50/60 dark:bg-primary-500/5' : ''"
            >
              <td
                class="px-4 py-2"
                :class="entry === currentEntry ? 'border-l-2 border-l-primary-500' : ''"
              >
                <div
                  class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0"
                  :class="entry === currentEntry
                    ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'"
                >
                  {{ getInitials(entry.lead) }}
                </div>
              </td>
              <td class="px-4 py-2 text-gray-900 dark:text-gray-100">
                <span class="inline-flex items-center gap-2">
                  {{ entry.lead }}
                  <span
                    v-if="entry === currentEntry"
                    class="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400"
                  >Current</span>
                </span>
              </td>
              <td class="px-4 py-2"><WorkgroupBadge :workgroup="entry.workgroup" :color-class="workgroupColors[entry.workgroup]" /></td>
              <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ formatDutyDate(entry.startDate) }}</td>
              <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ formatDutyDate(entry.endDate) }}</td>
            </tr>
            <tr v-if="rotation.length === 0">
              <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No rotation entries.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
