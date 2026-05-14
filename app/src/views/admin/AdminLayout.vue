<script setup lang="ts">
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'

const auth = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen flex">
    <aside class="w-64 bg-slate-900 text-slate-100 p-4 flex flex-col">
      <h1 class="text-xl font-bold mb-6">myHexa Admin</h1>
      <nav class="flex-1 space-y-1">
        <RouterLink
          :to="{ name: 'admin-devices' }"
          class="block px-3 py-2 rounded hover:bg-slate-800"
          active-class="bg-slate-800"
        >
          Devices
        </RouterLink>
      </nav>
      <div class="text-xs text-slate-400 mb-2 truncate">
        {{ auth.recipient?.contact_email }}
      </div>
      <Button variant="secondary" size="sm" @click="handleLogout">Se déconnecter</Button>
    </aside>
    <main class="flex-1 p-8 bg-slate-50">
      <RouterView />
    </main>
  </div>
</template>
