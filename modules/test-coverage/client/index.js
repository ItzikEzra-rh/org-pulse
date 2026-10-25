import { defineAsyncComponent } from 'vue'

export const routes = {
  'coverage': defineAsyncComponent(() => import('./views/CoverageView.vue')),
}
