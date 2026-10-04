<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'All' },
  // { value, label } for a shortcut button (e.g. "Assigned to me"); omit/null to hide it.
  meOption: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const dropdownRef = ref(null)
const search = ref('')

const normalizedOptions = computed(() =>
  props.options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )
)

// Search only narrows what's rendered; modelValue (selection) is never touched by it.
const filteredOptions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return normalizedOptions.value
  return normalizedOptions.value.filter(o => o.label.toLowerCase().includes(q))
})

const label = computed(() => {
  if (props.modelValue.length === 0) return props.placeholder
  if (props.modelValue.length === 1) {
    const opt = normalizedOptions.value.find(o => o.value === props.modelValue[0])
    return opt ? opt.label : props.modelValue[0]
  }
  return `${props.modelValue.length} selected`
})

function toggle(value) {
  const current = [...props.modelValue]
  const idx = current.indexOf(value)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(value)
  }
  emit('update:modelValue', current)
}

function clearAll() {
  emit('update:modelValue', [])
}

function selectMe() {
  if (props.meOption) emit('update:modelValue', [props.meOption.value])
}

function toggleOpen() {
  open.value = !open.value
  if (open.value) search.value = ''
}

function handleClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <button
      @click="toggleOpen"
      type="button"
      class="h-9 text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-1.5 min-w-[10rem]"
    >
      <span class="flex-1 text-left truncate">{{ label }}</span>
      <svg class="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute z-30 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 max-h-60 overflow-y-auto"
    >
      <div v-if="normalizedOptions.length > 0" class="px-2 pt-1.5 pb-1 sticky top-0 bg-white dark:bg-gray-800">
        <input
          v-model="search"
          @click.stop
          type="text"
          placeholder="Search..."
          class="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      <button
        v-if="modelValue.length > 0"
        @click="clearAll"
        type="button"
        class="w-full text-left px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
      >Clear all</button>

      <button
        v-if="meOption"
        @click="selectMe"
        type="button"
        class="w-full text-left px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
      >{{ meOption.label }}</button>

      <label
        v-for="opt in filteredOptions"
        :key="opt.value"
        class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
      >
        <input
          type="checkbox"
          :checked="modelValue.includes(opt.value)"
          @change="toggle(opt.value)"
          class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ opt.label }}</span>
      </label>

      <div v-if="normalizedOptions.length === 0" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
        No options available
      </div>
      <div v-else-if="filteredOptions.length === 0" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
        No matches for "{{ search }}"
      </div>
    </div>
  </div>
</template>
