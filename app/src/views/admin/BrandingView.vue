<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import BrandingPanel from '@/components/brand/BrandingPanel.vue'
const auth = useAuthStore()
</script>

<template>
  <div class="p-4 sm:p-6 space-y-6 max-w-3xl">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">Mon entreprise</h1>
      <p class="text-sm text-muted-foreground mt-1">Logo, site web et couleur affichés dans votre portail myHexa.</p>
    </header>
    <BrandingPanel v-if="auth.effectiveCompanyId" :key="auth.effectiveCompanyId" :company-id="auth.effectiveCompanyId" :staff="auth.isHexaStaff" />
  </div>
</template>
