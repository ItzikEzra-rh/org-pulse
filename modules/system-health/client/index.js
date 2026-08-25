import { defineAsyncComponent } from 'vue'

export const routes = {
  'operational-metrics': defineAsyncComponent(() => import('./views/OperationalMetricsView.vue')),
  'quality-analysis': defineAsyncComponent(() => import('./views/QualityAnalysisView.vue')),
  'component-maturity': defineAsyncComponent(() => import('./views/ComponentMaturityView.vue')),
  'disconnected-repo-detail': defineAsyncComponent(() => import('./views/DisconnectedRepoDetailView.vue'))
}
