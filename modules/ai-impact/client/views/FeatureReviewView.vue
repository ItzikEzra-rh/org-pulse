<script setup>
import { ref, watch, inject } from 'vue'
import { useFeatures } from '../composables/useFeatures.js'
import { useAIImpact } from '../composables/useAIImpact.js'
import { useModuleLink } from '@shared/client/composables/useModuleLink.js'
import { PHASES } from '../constants.js'
import FeatureReviewContent from '../components/FeatureReviewContent.vue'
import FeatureDetailPanel from '../components/FeatureDetailPanel.vue'
import AIImpactGuide from '../components/AIImpactGuide.vue'

const moduleNav = inject('moduleNav')
const { navigateTo: crossNavigate } = useModuleLink()
const selectedFeature = ref(null)
const searchQuery = ref('')
const aiInvolvementFilter = ref('all')
const recommendationFilter = ref('all')
const priorityFilter = ref('all')
const humanReviewFilter = ref('all')
const componentFilter = ref('all')
const artifactFilter = ref('all')
const sortBy = ref('default')
const chartExpanded = ref(true)

const {
  features, featureMeta, featureLoading, featureError, loadFeatures, loadFeatureDetail,
  featureTrendData, featureBreakdown, featureTimeWindow, loadFeatureTrend
} = useFeatures()

loadFeatures()
// Trend is auto-loaded by useFeatures() on first use and refetched by its
// watcher when the time window changes; no explicit call needed here.

// Load RFE data only for jiraHost (used by detail panel links)
const timeWindow = ref('month')
const { rfeData } = useAIImpact(timeWindow)

function handleRetry() {
  loadFeatures()
  loadFeatureTrend()
}

function handleSelectFeature(feature) {
  if (feature) {
    selectedFeature.value = feature
    moduleNav.navigateTo('design-review', { select: feature.key })
  }
}

function handleCloseModal() {
  selectedFeature.value = null
  moduleNav.navigateTo('design-review')
}

function handleNavigateToRFE(rfeKey) {
  moduleNav.navigateTo('prd-review', { select: rfeKey })
}

function handleNavigateToTestPlan(sourceKey) {
  moduleNav.navigateTo('test-plan-review', { select: sourceKey })
}

function handleNavigateToFeatureDetail(featureKey) {
  crossNavigate('releases', 'feature-detail', {
    key: featureKey,
    fromFeatureReview: '1'
  })
}

// Handle incoming select param (cross-link from RFE Review)
watch(() => moduleNav.params.value, (params) => {
  if (params?.select && Object.keys(features.value).length > 0) {
    const feature = Object.values(features.value).find(f => f.key === params.select)
    if (feature && selectedFeature.value?.key !== feature.key) {
      searchQuery.value = ''
      aiInvolvementFilter.value = 'all'
      recommendationFilter.value = 'all'
      priorityFilter.value = 'all'
      humanReviewFilter.value = 'all'
      componentFilter.value = 'all'
      artifactFilter.value = 'all'
      sortBy.value = 'default'
      selectedFeature.value = feature
    }
  }
}, { immediate: true })

// Also watch for features loading (select param may arrive before data)
watch(() => Object.keys(features.value).length, () => {
  const params = moduleNav.params.value
  if (params?.select && !selectedFeature.value) {
    const feature = Object.values(features.value).find(f => f.key === params.select)
    if (feature) {
      selectedFeature.value = feature
    }
  }
})
</script>

<template>
  <div class="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
    <FeatureReviewContent
      :loading="featureLoading"
      :error="featureError"
      :features="features"
      :featureMeta="featureMeta"
      :trendData="featureTrendData"
      :breakdown="featureBreakdown"
      :timeWindow="featureTimeWindow"
      :chartExpanded="chartExpanded"
      :searchQuery="searchQuery"
      :aiInvolvementFilter="aiInvolvementFilter"
      :recommendationFilter="recommendationFilter"
      :priorityFilter="priorityFilter"
      :humanReviewFilter="humanReviewFilter"
      :componentFilter="componentFilter"
      :artifactFilter="artifactFilter"
      :sortBy="sortBy"
      :selectedFeature="selectedFeature"
      @update:timeWindow="featureTimeWindow = $event"
      @update:chartExpanded="chartExpanded = $event"
      @update:searchQuery="searchQuery = $event"
      @update:aiInvolvementFilter="aiInvolvementFilter = $event"
      @update:recommendationFilter="recommendationFilter = $event"
      @update:priorityFilter="priorityFilter = $event"
      @update:humanReviewFilter="humanReviewFilter = $event"
      @update:componentFilter="componentFilter = $event"
      @update:artifactFilter="artifactFilter = $event"
      @update:sortBy="sortBy = $event"
      @selectFeature="handleSelectFeature"
      @retry="handleRetry"
    />

    <FeatureDetailPanel
      :show="!!selectedFeature"
      :feature="selectedFeature"
      :phases="PHASES"
      :jiraHost="rfeData?.jiraHost"
      :loadFeatureDetail="loadFeatureDetail"
      @close="handleCloseModal"
      @navigateToRFE="handleNavigateToRFE"
      @navigateToTestPlan="handleNavigateToTestPlan"
      @navigateToFeatureDetail="handleNavigateToFeatureDetail"
    />

    <AIImpactGuide />
  </div>
</template>
