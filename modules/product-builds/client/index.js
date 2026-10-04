import { defineAsyncComponent } from 'vue'

export const routes = {
  'osac': defineAsyncComponent(() => import('./views/BuildsView.vue')),
}
