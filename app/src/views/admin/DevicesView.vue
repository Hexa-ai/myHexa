<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import { formatRelative, isOnline } from '@/lib/utils'

const router = useRouter()
const { devices, loading, error, load } = useDevices()
const query = ref('')

function openDevice(id: string) {
  router.push({ name: 'admin-device-detail', params: { id } })
}

onMounted(load)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return devices.value
  return devices.value.filter((d) =>
    [d.name, d.serial_number, d.mac_eth0, d.address]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  )
})

const onlineCount = computed(() => devices.value.filter((d) => isOnline(d.last_connection_at)).length)
const offlineCount = computed(() => devices.value.length - onlineCount.value)
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-[1400px] mx-auto">
    <!-- Heading -->
    <header class="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8 sm:mb-10 fade-up">
      <div>
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3 flex items-center gap-2">
          <span class="text-signal">⬢</span> Fleet · read-only
        </div>
        <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight">
          Devices<span class="text-signal">.</span>
        </h1>
        <p class="mt-3 text-sm text-muted-foreground max-w-md">
          Inventaire en direct des capteurs déployés. Statut basé sur la dernière télémétrie (seuil 1 h).
        </p>
      </div>

      <!-- KPI strip -->
      <div class="grid grid-cols-3 gap-px bg-border border border-border rounded-sm overflow-hidden self-start md:self-auto w-full md:w-auto">
        <div class="bg-card px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5">{{ devices.length.toString().padStart(2, '0') }}</div>
        </div>
        <div class="bg-card px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span class="size-1 rounded-full bg-signal pulse-dot" /> Online
          </div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5 text-signal">{{ onlineCount.toString().padStart(2, '0') }}</div>
        </div>
        <div class="bg-card px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Offline</div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5" :class="offlineCount > 0 ? 'text-offline' : ''">
            {{ offlineCount.toString().padStart(2, '0') }}
          </div>
        </div>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-3 mb-3 fade-up" style="animation-delay: 60ms">
      <div class="relative flex-1 sm:flex-none sm:w-72">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">⌕</span>
        <input
          v-model="query"
          type="search"
          placeholder="filter devices…"
          class="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-sm text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-signal/60 focus:ring-1 focus:ring-signal/40 transition"
        />
      </div>
      <div class="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {{ filtered.length }} / {{ devices.length }} shown
      </div>
    </div>

    <!-- Status / loading -->
    <div v-if="loading" class="border border-border rounded-sm bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground">
      <span class="blink">▍</span> loading telemetry…
    </div>
    <div v-else-if="error" class="border border-offline/40 rounded-sm bg-offline-soft p-5 font-mono text-sm text-offline">
      ERR · {{ error }}
    </div>

    <!-- Table (md+) -->
    <div v-else class="hidden md:block border border-border rounded-sm bg-card/40 overflow-hidden fade-up" style="animation-delay: 120ms">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-card/60">
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-5 py-3 w-[160px]">Status</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-5 py-3">Name</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-5 py-3 hidden lg:table-cell">Serial</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-5 py-3 hidden xl:table-cell">MAC</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-5 py-3 w-[200px]">Last seen</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(device, i) in filtered"
            :key="device.id"
            @click="openDevice(device.id)"
            class="group border-b border-border/50 last:border-0 hover:bg-secondary/40 cursor-pointer transition-colors fade-up"
            :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
          >
            <td class="px-5 py-3.5">
              <template v-if="isOnline(device.last_connection_at)">
                <span class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-signal pulse-dot" />
                  <span class="text-signal">online</span>
                </span>
              </template>
              <template v-else>
                <span class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-offline/70" />
                  <span class="text-offline/80">offline</span>
                </span>
              </template>
            </td>
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-2">
                <span class="opacity-0 group-hover:opacity-100 text-signal transition">›</span>
                <span class="font-medium tracking-tight">{{ device.name || '—' }}</span>
              </div>
            </td>
            <td class="px-5 py-3.5 font-mono text-xs text-muted-foreground tabular hidden lg:table-cell">
              {{ device.serial_number || '—' }}
            </td>
            <td class="px-5 py-3.5 font-mono text-xs text-muted-foreground hidden xl:table-cell">
              {{ device.mac_eth0 || '—' }}
            </td>
            <td class="px-5 py-3.5 text-right">
              <span class="font-mono text-xs text-muted-foreground tabular">
                {{ formatRelative(device.last_connection_at) }}
              </span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="5" class="px-5 py-16 text-center">
              <div class="text-2xl text-muted-foreground/60 font-light">Aucun device</div>
              <div class="mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                no devices matching current view
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Card list (mobile only) -->
    <div v-if="!loading && !error" class="md:hidden space-y-2 fade-up" style="animation-delay: 120ms">
      <button
        v-for="(device, i) in filtered"
        :key="device.id"
        @click="openDevice(device.id)"
        class="w-full text-left border border-border rounded-md bg-card/40 px-4 py-3.5 hover:bg-secondary/40 transition-colors fade-up"
        :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
      >
        <div class="flex items-center justify-between gap-3 mb-1.5">
          <span class="font-medium tracking-tight truncate">{{ device.name || '—' }}</span>
          <span
            class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider shrink-0"
            :class="isOnline(device.last_connection_at) ? 'text-signal' : 'text-offline/80'"
          >
            <span :class="['size-1.5 rounded-full', isOnline(device.last_connection_at) ? 'bg-signal pulse-dot' : 'bg-offline/70']" />
            {{ isOnline(device.last_connection_at) ? 'online' : 'offline' }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-3 text-[11px] font-mono text-muted-foreground">
          <span class="truncate">{{ device.serial_number || '—' }}</span>
          <span class="tabular shrink-0">{{ formatRelative(device.last_connection_at) }}</span>
        </div>
      </button>
      <div
        v-if="filtered.length === 0"
        class="border border-border rounded-md bg-card/40 p-10 text-center"
      >
        <div class="text-xl text-muted-foreground/60 font-light">Aucun device</div>
        <div class="mt-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          no devices matching current view
        </div>
      </div>
    </div>
  </section>
</template>
