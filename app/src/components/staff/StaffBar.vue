<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import CompanyPickerDropdown from './CompanyPickerDropdown.vue'

const auth = useAuthStore()
const router = useRouter()

function onPick(id: string | null) {
  auth.setActAsCompany(id)
}

function backToStaff() {
  auth.setActAsCompany(null)
  router.push({ name: 'staff-companies' })
}
</script>

<template>
  <div
    class="h-9 border-b border-signal/40 bg-signal/10 text-signal flex items-center gap-4 px-4 sm:px-6 font-mono text-[10px] uppercase tracking-wider"
  >
    <span class="opacity-60">Staff</span>
    <span class="flex items-center gap-2">
      <span>agit comme :</span>
      <CompanyPickerDropdown
        :model-value="auth.actAsCompanyId"
        @update:model-value="onPick"
      />
    </span>
    <span class="opacity-60 hidden sm:inline">
      · {{ auth.isHexaStaffAdmin ? 'admin' : 'viewer' }}
    </span>
    <button
      class="ml-auto inline-flex items-center gap-1 opacity-70 hover:opacity-100 transition"
      type="button"
      @click="backToStaff"
    >
      ↩ retour staff
    </button>
  </div>
</template>
