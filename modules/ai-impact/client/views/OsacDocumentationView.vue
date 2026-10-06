<script setup>
import { useDocumentation } from '../composables/useDocumentation.js'
import { useDocMrKpi } from '../composables/useDocMrKpi.js'
import DocumentationContent from '../components/DocumentationContent.vue'

const { docData, loading, error, load } = useDocumentation()
const { mrKpiData } = useDocMrKpi()
</script>

<template>
  <DocumentationContent
    :loading="loading"
    :error="error"
    :docData="docData"
    :mrKpiData="mrKpiData"
    @retry="load"
  />
</template>
