<script setup>
const UOI_URL = 'https://devtools.pages.redhat.com/n8n-pulumi-poc/#/?org=ecosystem&product=osac&team=osac'
</script>

<template>
  <div class="flex flex-col -mx-6 -my-6 lg:-mx-8 min-h-[calc(100vh-4rem)]">
    <div class="px-6 lg:px-8 pt-3 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Operational Metrics</h1>
        <a
          :href="UOI_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >Open in new tab</a>
      </div>
    </div>

    <iframe
      :src="UOI_URL"
      title="Unified Operational Intelligence — OSAC"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      class="w-full flex-1 border-0 block min-h-0 h-[calc(100vh-9rem)]"
    />
  </div>
</template>
