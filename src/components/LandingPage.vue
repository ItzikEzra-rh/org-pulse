<template>
  <div>
    <div ref="topSectionRef">
      <!-- Hero -->
      <div class="mb-8 rounded-2xl border border-primary-200 dark:border-primary-800 bg-gradient-to-br from-primary-50 via-white to-blue-50 dark:from-primary-950/40 dark:via-gray-900 dark:to-blue-950/30 p-6 sm:p-8">
        <p class="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-3">WHAT IS ORG PULSE?</p>
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 max-w-3xl">Red Hat Ecosystem Engineering | Edge</h1>
        <p class="mt-3 max-w-3xl text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-300">
          Org Pulse brings together people, delivery, engineering, and AI signals to give Edge teams a shared view of what's happening and where attention is needed.
        </p>
      </div>

      <!-- Admin recovery notice: no enabled built-in modules -->
      <div
        v-if="isAdmin && builtInManifests.length === 0"
        class="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
      >
        <span>No built-in modules are currently enabled.</span>
        <button
          @click="$emit('navigate', 'settings')"
          class="font-medium text-amber-900 dark:text-amber-200 underline hover:no-underline shrink-0"
        >
          Configure modules
        </button>
      </div>

      <!-- Explore Org Pulse -->
      <section class="mb-8" aria-labelledby="explore-org-pulse-heading">
        <p id="explore-org-pulse-heading" class="px-1 mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          EXPLORE ORG PULSE
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            v-for="card in exploreCards"
            :key="card.slug"
            :disabled="!card.enabled"
            :title="card.enabled ? undefined : 'Not available in this deployment'"
            @click="$emit('navigate', card.slug)"
            class="rounded-xl border bg-white dark:bg-gray-800 p-5 text-left transition-all focus:outline-none"
            :class="card.enabled
              ? 'border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
              : 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed'"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="w-fit rounded-lg bg-primary-50 dark:bg-primary-900/30 p-2 text-primary-600 dark:text-primary-400">
                <component :is="getIcon(card.icon)" :size="20" />
              </div>
              <span v-if="!card.enabled" class="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Not Enabled</span>
            </div>
            <h3 class="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">{{ card.name }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{{ card.description }}</p>
          </button>
        </div>
      </section>
    </div>

    <template v-if="allWidgets.length > 0">
      <!-- Your Overview -->
      <div class="flex items-center justify-between gap-4 mb-6">
        <p class="px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          YOUR OVERVIEW
        </p>
        <button
          @click="showWidgetPicker = true"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shrink-0"
        >
          <Plus :size="16" />
          Add Widgets
        </button>
      </div>

      <!-- Widget grid -->
      <div
        ref="gridRef"
        class="sotu-grid"
      >
        <SotuWidget
          v-for="item in resolvedLayout"
          :key="item.widgetId"
          :widget-id="item.widgetId"
          :name="item.widget.name"
          :module-name="item.widget.moduleName"
          :size="item.size"
          :component="item.component"
          @resize="handleResize"
          @remove="handleRemove"
        />
      </div>

      <!-- Empty layout state -->
      <div
        v-if="resolvedLayout.length === 0"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <LayoutGrid :size="48" class="text-gray-300 dark:text-gray-600 mb-4" />
        <h3 class="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">Build Your Dashboard</h3>
        <p class="text-sm text-gray-400 dark:text-gray-500 mb-4 max-w-md">Choose from available widgets to create a personalized overview of what matters to you across the platform.</p>
        <button
          @click="showWidgetPicker = true"
          class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
        >
          <Plus :size="16" />
          Add Widgets
        </button>
      </div>

      <!-- Widget picker -->
      <WidgetPicker
        v-if="showWidgetPicker"
        :available-widgets="allWidgets"
        :active-widget-ids="activeWidgetIds"
        @close="showWidgetPicker = false"
        @toggle="handleToggleWidget"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import {
  Box,
  UsersRound,
  LayoutGrid,
  Sparkles,
  Hospital,
  Rocket,
  Plus
} from 'lucide-vue-next'
import Sortable from 'sortablejs'
import { useAuth } from '@shared/client/composables/useAuth.js'
import { loadModuleWidget } from '../module-loader'
import { useSotuLayout } from '../composables/useSotuLayout.js'
import SotuWidget from './SotuWidget.vue'
import WidgetPicker from './WidgetPicker.vue'

const props = defineProps({
  builtInManifests: { type: Array, default: () => [] },
  isAdmin: Boolean
})

defineEmits(['navigate'])

const { isManager, isTeamAdmin } = useAuth()
const showWidgetPicker = ref(false)
const gridRef = ref(null)
const topSectionRef = ref(null)
let sortableInstance = null
let topSectionObserver = null
let lastTopSectionHeight = null

const EXPLORE_CARDS = [
  {
    slug: 'team-tracker',
    name: 'People & Teams',
    description: 'Explore people, teams, ownership, and organizational insights.',
    icon: 'users-round'
  },
  {
    slug: 'releases',
    name: 'Releases',
    description: 'Plan releases, track execution, and understand delivery readiness.',
    icon: 'rocket'
  },
  {
    slug: 'ai-impact',
    name: 'AI Impact',
    description: 'Explore AI-assisted planning, reviews, and engineering workflows.',
    icon: 'sparkles'
  },
  {
    slug: 'system-health',
    name: 'System Health',
    description: 'Monitor delivery health, operational trends, and engineering signals.',
    icon: 'hospital'
  }
]

const {
  layout,
  isFirstVisit,
  initWithDefaults,
  pruneStaleWidgets,
  addWidget,
  removeWidget,
  moveWidget,
  resizeWidget,
  hasWidget
} = useSotuLayout()

const exploreCards = computed(() =>
  EXPLORE_CARDS.map(card => ({
    ...card,
    enabled: props.builtInManifests.some(m => m.slug === card.slug)
  }))
)

// Build flat list of all available widgets from all modules
const allWidgets = computed(() => {
  const widgets = []
  for (const mod of props.builtInManifests) {
    const sotuWidgets = mod.client?.sotuWidgets
    if (!sotuWidgets || !Array.isArray(sotuWidgets)) continue
    for (const w of sotuWidgets) {
      if (w.requireRole === 'manager' && !isManager.value) continue
      if (w.requireRole === 'team-admin' && !isTeamAdmin.value) continue
      widgets.push({
        qualifiedId: `${mod.slug}:${w.id}`,
        moduleSlug: mod.slug,
        moduleName: mod.name,
        name: w.name,
        description: w.description,
        component: w.component,
        defaultSize: w.defaultSize || 'half',
        icon: w.icon,
        category: w.category,
        default: w.default === true
      })
    }
  }
  return widgets
})

// Seed first-time layout with default widgets, then prune stale widgets when manifests change
watch(allWidgets, (widgets) => {
  if (widgets.length === 0) return
  if (isFirstVisit.value) {
    initWithDefaults(widgets.filter(w => w.default))
  }
  pruneStaleWidgets(widgets.map(w => w.qualifiedId))
}, { immediate: true })

// Widget component cache
const widgetComponentCache = {}

function getWidgetComponent(widget) {
  const cacheKey = widget.qualifiedId
  if (!widgetComponentCache[cacheKey]) {
    widgetComponentCache[cacheKey] = loadModuleWidget(widget.moduleSlug, widget.component)
  }
  return widgetComponentCache[cacheKey]
}

// Resolve layout items to actual components
const resolvedLayout = computed(() => {
  if (!layout.value) return []
  const widgetMap = {}
  for (const w of allWidgets.value) {
    widgetMap[w.qualifiedId] = w
  }
  return layout.value
    .filter(item => widgetMap[item.widgetId])
    .map(item => ({
      widgetId: item.widgetId,
      size: item.size,
      widget: widgetMap[item.widgetId],
      component: getWidgetComponent(widgetMap[item.widgetId])
    }))
})

// Set of active widget IDs for the picker
const activeWidgetIds = computed(() => {
  if (!layout.value) return new Set()
  return new Set(layout.value.map(item => item.widgetId))
})

function handleResize(widgetId, newSize) {
  resizeWidget(widgetId, newSize)
}

function handleRemove(widgetId) {
  removeWidget(widgetId)
}

function handleToggleWidget(widgetId, defaultSize) {
  if (hasWidget(widgetId)) {
    removeWidget(widgetId)
  } else {
    addWidget(widgetId, defaultSize)
  }
}

// SortableJS integration
const SORT_ANIMATION_MS = 150

function initSortable() {
  if (!gridRef.value) return
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  sortableInstance = Sortable.create(gridRef.value, {
    animation: SORT_ANIMATION_MS,
    handle: '.drag-handle',
    ghostClass: 'opacity-30',
    onEnd(evt) {
      if (evt.oldIndex !== evt.newIndex) {
        moveWidget(evt.oldIndex, evt.newIndex)
      }
    }
  })
}

watch(resolvedLayout, () => {
  nextTick(() => {
    initSortable()
    // Notify position-dependent widgets (ResizeObserver won't catch a pure position change)
    // once Sortable's reorder animation settles.
    setTimeout(() => window.dispatchEvent(new Event('sotu-layout-changed')), SORT_ANIMATION_MS)
  })
})

// Sidebar collapse/expand resizes main content without a window resize event, which can
// reflow the Hero/card text and shift the widget grid below without the usual recalculation.
function handleTopSectionResize(entries) {
  const height = Math.round(entries[0].contentRect.height)
  if (lastTopSectionHeight !== null && height !== lastTopSectionHeight) {
    window.dispatchEvent(new Event('sotu-layout-changed'))
  }
  lastTopSectionHeight = height
}

onMounted(() => {
  nextTick(() => initSortable())
  if (typeof ResizeObserver !== 'undefined' && topSectionRef.value) {
    topSectionObserver = new ResizeObserver(handleTopSectionResize)
    topSectionObserver.observe(topSectionRef.value)
  }
})

onBeforeUnmount(() => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  topSectionObserver?.disconnect()
})

const iconMap = {
  'users-round': UsersRound,
  'rocket': Rocket,
  'sparkles': Sparkles,
  'hospital': Hospital
}

function getIcon(iconName) {
  return iconMap[iconName] || Box
}
</script>

<style>
.sotu-grid {
  columns: 2;
  column-gap: 1rem;
}

.sotu-grid > .sotu-widget {
  break-inside: avoid;
  margin-bottom: 1rem;
}

.sotu-widget-full {
  column-span: all;
}

/* Mobile: single column */
@media (max-width: 768px) {
  .sotu-grid {
    columns: 1;
  }
  .sotu-widget-full {
    column-span: none;
  }
}
</style>
