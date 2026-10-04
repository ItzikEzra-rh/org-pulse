<script setup>
import { onMounted } from 'vue'
import { ShieldCheckIcon, CalendarDaysIcon } from 'lucide-vue-next'
import { useModuleLink } from '@shared/client/composables/useModuleLink.js'
import { useCiDuty, formatDutyDate, getInitials } from '../composables/useCiDuty.js'
import WorkgroupBadge from '../components/ci-duty/WorkgroupBadge.vue'

defineProps({
  size: { type: String, default: 'half' }
})

const { navigateTo } = useModuleLink()
const { loading, error, notFound, inapplicable, unavailable, load, currentEntry, nextEntry, workgroupColors } = useCiDuty()

onMounted(load)
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="flex items-center gap-1.5 text-base font-semibold text-gray-900 dark:text-gray-100">
        <ShieldCheckIcon class="w-4 h-4 text-gray-400 dark:text-gray-500" />
        CI Duty
      </h3>
      <button
        @click="navigateTo('system-health', 'ci-duty')"
        class="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >View all</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="animate-pulse flex items-center gap-3">
      <div class="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
      <div class="flex-1 space-y-2">
        <div class="h-3.5 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        <div class="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>

    <!-- Error / missing data -->
    <p v-else-if="error || notFound" class="text-sm text-gray-500 dark:text-gray-400 py-1">
      CI Duty roster unavailable.
    </p>

    <p v-else-if="inapplicable" class="text-sm text-gray-500 dark:text-gray-400 py-1">
      CI Duty is not applicable to this project.
    </p>

    <p v-else-if="unavailable" class="text-sm text-gray-500 dark:text-gray-400 py-1">
      Select a project to load CI Duty status.
    </p>

    <template v-else>
      <div :class="size === 'full' ? 'w-full xl:max-w-xl' : 'w-full'">
        <!-- No current duty -->
        <p v-if="!currentEntry" class="text-sm text-gray-500 dark:text-gray-400 py-1">
          No one is currently on CI Duty.
        </p>

        <div v-else class="rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 border-l-primary-500 bg-primary-50/40 dark:bg-primary-500/5 p-4">
          <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400">
            <span class="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
            Current
          </span>

          <div class="mt-3 xl:flex xl:items-start xl:gap-4">
            <!-- Lead details -->
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-900/50 ring-2 ring-primary-200 dark:ring-primary-800/60 flex items-center justify-center text-base font-semibold text-primary-700 dark:text-primary-300 shrink-0">
                {{ getInitials(currentEntry.lead) }}
              </div>
              <div class="min-w-0">
                <p class="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{{ currentEntry.lead }}</p>
                <WorkgroupBadge class="mt-1" :workgroup="currentEntry.workgroup" :color-class="workgroupColors[currentEntry.workgroup]" />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                  <CalendarDaysIcon class="w-3.5 h-3.5 shrink-0" />
                  {{ formatDutyDate(currentEntry.startDate) }} – {{ formatDutyDate(currentEntry.endDate) }}
                </p>
              </div>
            </div>

            <!-- Supporting copy -->
            <div class="mt-3 pt-3 border-t border-primary-100 dark:border-primary-900/30 xl:mt-0 xl:pt-0 xl:border-t-0 xl:border-l xl:pl-4 xl:flex-1 xl:min-w-0">
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">On duty this week</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Keeping our CI systems healthy and running.</p>
            </div>
          </div>
        </div>

        <div v-if="nextEntry" class="flex items-start gap-2.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
          <div class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-600 dark:text-gray-300 shrink-0 mt-0.5">
            {{ getInitials(nextEntry.lead) }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] leading-snug truncate">
              <span class="font-semibold text-gray-500 dark:text-gray-400">Next:</span>{{ ' ' }}<span class="font-medium text-gray-900 dark:text-gray-100">{{ nextEntry.lead }}</span>
            </p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <WorkgroupBadge :workgroup="nextEntry.workgroup" :color-class="workgroupColors[nextEntry.workgroup]" />
              <span class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <CalendarDaysIcon class="w-3 h-3 shrink-0" />
                {{ formatDutyDate(nextEntry.startDate) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
