<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { componentDisplayLabel, assigneeDisplayLabel } from '../composables/useComponentStatusFilter'

const props = defineProps({
  componentOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  teamOptions: { type: Array, default: () => [] },
  assigneeOptions: { type: Array, default: () => [] },
  selectedComponents: { type: Array, default: () => [] },
  selectedStatuses: { type: Array, default: () => [] },
  selectedTeams: { type: Array, default: () => [] },
  selectedAssignees: { type: Array, default: () => [] },
  // Current user's Jira display name for the "Assigned to me" shortcut; null hides it.
  meAssignee: { type: String, default: null }
})

const emit = defineEmits(['toggle-component', 'toggle-status', 'toggle-team', 'toggle-assignee', 'set-assignee-me', 'clear'])

const assigneeSearch = ref('')

// Search only narrows what's rendered; selectedAssignees is never touched by it.
const filteredAssigneeOptions = computed(() => {
  const q = assigneeSearch.value.trim().toLowerCase()
  if (!q) return props.assigneeOptions
  return props.assigneeOptions.filter(a => assigneeDisplayLabel(a).toLowerCase().includes(q))
})

const componentOpen = ref(false)
const statusOpen = ref(false)
const teamOpen = ref(false)
const assigneeOpen = ref(false)
const componentRef = ref(null)
const statusRef = ref(null)
const teamRef = ref(null)
const assigneeRef = ref(null)

function closeAll() {
  componentOpen.value = false
  statusOpen.value = false
  teamOpen.value = false
  assigneeOpen.value = false
}

function toggleDropdown(name) {
  const map = { component: componentOpen, status: statusOpen, team: teamOpen, assignee: assigneeOpen }
  const wasOpen = map[name].value
  closeAll()
  if (!wasOpen) {
    map[name].value = true
    if (name === 'assignee') assigneeSearch.value = ''
  }
}

function handleClickOutside(event) {
  const refs = [componentRef, statusRef, teamRef, assigneeRef]
  for (const r of refs) {
    if (r.value && r.value.contains(event.target)) return
  }
  closeAll()
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

const hasActiveFilters = computed(() =>
  props.selectedComponents.length > 0 || props.selectedStatuses.length > 0 ||
  props.selectedTeams.length > 0 || props.selectedAssignees.length > 0
)

function multiLabel(selected, allLabel) {
  if (!selected || selected.length === 0) return allLabel
  if (selected.length === 1) return selected[0]
  return selected.length + ' selected'
}

const btnClass = 'flex items-center gap-1.5 cursor-pointer text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400'
const btnActiveClass = 'flex items-center gap-1.5 cursor-pointer text-xs rounded-md border border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400'
const dropdownClass = 'absolute z-50 mt-1 w-64 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg'
const optionClass = 'flex items-center gap-2 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
</script>

<template>
  <div class="py-3 px-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
    <div class="flex flex-wrap items-center gap-3">
      <!-- Component -->
      <div v-if="componentOptions.length > 0" class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Component</label>
        <div ref="componentRef" class="relative">
          <button type="button" @click="toggleDropdown('component')" @keydown.escape="componentOpen = false" :aria-expanded="componentOpen" aria-haspopup="listbox" :class="selectedComponents.length ? btnActiveClass : btnClass">
            <span class="truncate max-w-[140px]">{{ multiLabel(selectedComponents.map(componentDisplayLabel), 'All components') }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div v-if="componentOpen" role="group" :class="dropdownClass" @keydown.escape="componentOpen = false">
            <label v-for="c in componentOptions" :key="c" :class="optionClass">
              <input type="checkbox" :checked="selectedComponents.includes(c)" @change="emit('toggle-component', c)" class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span class="truncate">{{ componentDisplayLabel(c) }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Status -->
      <div v-if="statusOptions.length > 0" class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Status</label>
        <div ref="statusRef" class="relative">
          <button type="button" @click="toggleDropdown('status')" @keydown.escape="statusOpen = false" :aria-expanded="statusOpen" aria-haspopup="listbox" :class="selectedStatuses.length ? btnActiveClass : btnClass">
            <span class="truncate max-w-[140px]">{{ multiLabel(selectedStatuses, 'All statuses') }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div v-if="statusOpen" role="group" :class="dropdownClass" @keydown.escape="statusOpen = false">
            <label v-for="s in statusOptions" :key="s" :class="optionClass">
              <input type="checkbox" :checked="selectedStatuses.includes(s)" @change="emit('toggle-status', s)" class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span class="truncate">{{ s }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Team -->
      <div v-if="teamOptions.length > 0" class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Team</label>
        <div ref="teamRef" class="relative">
          <button type="button" @click="toggleDropdown('team')" @keydown.escape="teamOpen = false" :aria-expanded="teamOpen" aria-haspopup="listbox" :class="selectedTeams.length ? btnActiveClass : btnClass">
            <span class="truncate max-w-[140px]">{{ multiLabel(selectedTeams, 'All teams') }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div v-if="teamOpen" role="group" :class="dropdownClass" @keydown.escape="teamOpen = false">
            <label v-for="t in teamOptions" :key="t" :class="optionClass">
              <input type="checkbox" :checked="selectedTeams.includes(t)" @change="emit('toggle-team', t)" class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span class="truncate">{{ t }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Assignee -->
      <div v-if="assigneeOptions.length > 0" class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Assignee</label>
        <div ref="assigneeRef" class="relative">
          <button type="button" @click="toggleDropdown('assignee')" @keydown.escape="assigneeOpen = false" :aria-expanded="assigneeOpen" aria-haspopup="listbox" :class="selectedAssignees.length ? btnActiveClass : btnClass">
            <span class="truncate max-w-[140px]">{{ multiLabel(selectedAssignees.map(assigneeDisplayLabel), 'All assignees') }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div v-if="assigneeOpen" role="group" :class="dropdownClass" @keydown.escape="assigneeOpen = false">
            <div v-if="assigneeOptions.length > 0" class="px-2 pt-1.5 pb-1 sticky top-0 bg-white dark:bg-gray-800">
              <input
                v-model="assigneeSearch"
                @click.stop
                type="text"
                placeholder="Search assignees..."
                class="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <button
              v-if="meAssignee"
              type="button"
              @click="emit('set-assignee-me')"
              class="w-full text-left px-3 py-1.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
            >Assigned to me</button>
            <label v-for="a in filteredAssigneeOptions" :key="a" :class="optionClass">
              <input type="checkbox" :checked="selectedAssignees.includes(a)" @change="emit('toggle-assignee', a)" class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span class="truncate">{{ assigneeDisplayLabel(a) }}</span>
            </label>
            <div v-if="assigneeOptions.length === 0" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No options available</div>
            <div v-else-if="filteredAssigneeOptions.length === 0" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No matches for "{{ assigneeSearch }}"</div>
          </div>
        </div>
      </div>

      <!-- Clear filters -->
      <div v-if="hasActiveFilters" class="flex flex-col gap-0.5 justify-end">
        <span class="text-xs font-medium text-transparent select-none">Clear</span>
        <button type="button" @click="emit('clear')" class="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Clear filters
        </button>
      </div>
    </div>

    <p class="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
      Filter coverage reflects current Jira data. Missing values are shown as Unassigned / Unknown.
    </p>
  </div>
</template>
