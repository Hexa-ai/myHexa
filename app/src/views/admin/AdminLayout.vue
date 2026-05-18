<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import { useAlarmCounts, ALARM_COUNTS_KEY } from '@/composables/useAlarmCounts'
import StaffBar from '@/components/staff/StaffBar.vue'

const { theme, toggle: toggleTheme } = useTheme()
const alarms = useAlarmCounts()
provide(ALARM_COUNTS_KEY, alarms)

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function handleLogout() {
  await auth.signOut()
  router.push({ name: 'login' })
}

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => (now.value = new Date()), 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const clock = computed(() =>
  now.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
)

const company = computed(() => auth.companyName ?? '—')
const email = computed(() => auth.recipient?.contact_email ?? '—')
const role = computed(() => auth.recipient?.role ?? 'member')

const breadcrumb = computed(() => {
  const map: Record<string, string> = {
    'admin-devices': 'devices',
    'admin-device-detail': 'devices / detail',
    'admin-device-periodic': 'devices / rapports',
    'admin-map': 'map',
    'admin-alarms': 'alarms',
    'admin-interventions': 'interventions',
    'admin-recipients': 'destinataires',
    'staff-companies': 'staff / companies',
    'staff-company-detail': 'staff / company',
    'staff-devices': 'staff / devices',
    'staff-device-new': 'staff / new device',
  }
  return map[String(route.name ?? '')] ?? String(route.name ?? '')
})

const isAdmin = computed(() => auth.recipient?.role === 'admin')

// Couleur du chip "à traiter" en fonction de la gravité max (alarmes + signalements).
// error → rouge (offline), warning → ambre, info → bleu (signal).
const urgentChipClass = computed(() => {
  const sev = alarms.maxSeverity.value
  if (sev === 'warning') return 'border-amber/50 bg-amber/10 text-amber hover:bg-amber/20'
  if (sev === 'info') return 'border-signal/50 bg-signal/10 text-signal hover:bg-signal/20'
  // error ou null/fallback : rouge clignotant
  return 'border-offline/50 bg-offline/10 text-offline hover:bg-offline/20 alarm-flash'
})
const urgentDotClass = computed(() => {
  const sev = alarms.maxSeverity.value
  if (sev === 'warning') return 'bg-amber'
  if (sev === 'info') return 'bg-signal'
  return 'bg-offline'
})
const isInterventions = computed(() => route.name === 'admin-interventions')
const isRecipients = computed(() => route.name === 'admin-recipients')

const sidebarOpen = ref(false)
function closeSidebar() { sidebarOpen.value = false }
function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value }

function goDevices() { router.push({ name: 'admin-devices' }); closeSidebar() }
function goMap() { router.push({ name: 'admin-map' }); closeSidebar() }
function goAlarms() { router.push({ name: 'admin-alarms' }); closeSidebar() }
function goInterventions() { router.push({ name: 'admin-interventions' }); closeSidebar() }
function goRecipients() { router.push({ name: 'admin-recipients' }); closeSidebar() }
function goStaff() { router.push({ name: 'staff-companies' }); closeSidebar() }
const isDevices = computed(() => route.name === 'admin-devices' || route.name === 'admin-device-detail' || route.name === 'admin-device-periodic')
const isMap = computed(() => route.name === 'admin-map')
const isAlarms = computed(() => route.name === 'admin-alarms')
const isStaff = computed(() => String(route.name ?? '').startsWith('staff-'))
</script>

<template>
  <div class="h-screen flex text-foreground overflow-hidden">
    <!-- Mobile backdrop -->
    <div
      v-if="sidebarOpen"
      class="md:hidden fixed inset-0 bg-background/70 backdrop-blur-sm z-30"
      @click="closeSidebar"
    />

    <aside
      :class="[
        'fixed md:static inset-y-0 left-0 w-64 shrink-0 border-r border-border bg-card md:bg-card/60 backdrop-blur-sm flex flex-col z-40 transition-transform md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
    >
      <!-- Logo -->
      <div class="px-5 pt-6 pb-5 border-b border-border">
        <img
          :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
          alt="Hexa.ai"
          class="h-9 w-[140px] object-contain object-left select-none"
          draggable="false"
        />
        <div class="mt-4 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="size-1.5 rounded-full bg-signal pulse-dot shrink-0" />
            <span class="font-mono text-[11px] uppercase tracking-wider text-muted-foreground truncate">{{ company }}</span>
          </div>
          <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-signal/80 shrink-0">Edge</span>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-0.5">
        <button
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isDevices
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goDevices"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isDevices ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
            <path d="M3 7l9 5 9-5M12 12v10" stroke-opacity="0.5" />
          </svg>
          <span class="tracking-tight">Devices</span>
          <span v-if="isDevices" class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal">●</span>
        </button>

        <button
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isMap
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goMap"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isMap ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M1 6v17l7-3 8 3 7-3V3l-7 3-8-3-7 3Z" />
            <path d="M8 3v17M16 6v17" stroke-opacity="0.5" />
          </svg>
          <span class="tracking-tight">Carte</span>
          <span v-if="isMap" class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal">●</span>
        </button>

        <button
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isAlarms
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goAlarms"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isAlarms ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span class="tracking-tight">Alarmes</span>
          <span
            v-if="alarms.urgent.value > 0"
            class="ml-auto font-mono text-[10px] font-semibold tabular px-1.5 py-0.5 rounded bg-offline text-background alarm-flash"
            :title="`${alarms.active.value} alarmes capteur · ${alarms.openSignalements.value} signalements ouverts`"
          >
            {{ alarms.urgent.value }}
          </span>
          <span
            v-else-if="isAlarms"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
          >
            ●
          </span>
        </button>

        <button
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isInterventions
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goInterventions"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isInterventions ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span class="tracking-tight">Interventions</span>
          <span
            v-if="alarms.openInterventions.value > 0"
            class="ml-auto font-mono text-[10px] font-semibold tabular px-1.5 py-0.5 rounded bg-signal/15 text-signal border border-signal/30"
            :title="`${alarms.openInterventions.value} interventions ouvertes`"
          >
            {{ alarms.openInterventions.value }}
          </span>
          <span
            v-else-if="isInterventions"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
          >
            ●
          </span>
        </button>

        <button
          v-if="isAdmin"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isRecipients
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goRecipients"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isRecipients ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span class="tracking-tight">Destinataires</span>
          <span v-if="isRecipients" class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal">●</span>
        </button>
        <div class="px-3 py-2.5 text-sm text-muted-foreground/40 cursor-not-allowed select-none flex items-center gap-3">
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-6" />
          </svg>
          <span>Reports</span>
          <span class="ml-auto text-[9px] uppercase tracking-widest">soon</span>
        </div>

        <div v-if="auth.isHexaStaff" class="my-3 border-t border-border" />

        <button
          v-if="auth.isHexaStaff"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isStaff
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goStaff"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isStaff ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
          </svg>
          <span class="tracking-tight">Staff</span>
          <span v-if="isStaff" class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal">●</span>
        </button>
      </nav>

      <!-- Session -->
      <div class="border-t border-border px-4 py-4 space-y-2.5">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Session</div>
        <div class="text-xs truncate">{{ email }}</div>
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] uppercase px-1.5 py-0.5 border border-hairline rounded text-muted-foreground bg-secondary/60">
            {{ role }}
          </span>
          <button
            class="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
            @click="handleLogout"
          >
            sign out ↗
          </button>
        </div>
      </div>
    </aside>

    <div class="flex-1 flex flex-col min-w-0">
      <StaffBar v-if="auth.isHexaStaff" />
      <header class="h-12 border-b border-border bg-background/60 backdrop-blur-sm flex items-center justify-between px-3 sm:px-5 md:px-6">
        <div class="flex items-center gap-2 sm:gap-2.5 text-xs font-mono text-muted-foreground min-w-0">
          <button
            class="md:hidden size-8 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 text-muted-foreground hover:text-foreground transition shrink-0"
            aria-label="Menu"
            @click="toggleSidebar"
          >
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span class="text-signal hidden sm:inline">⬢</span>
          <span class="text-muted-foreground/50 hidden sm:inline">/</span>
          <span class="hidden sm:inline">admin</span>
          <span class="text-muted-foreground/50 hidden sm:inline">/</span>
          <span class="text-foreground truncate">{{ breadcrumb }}</span>
        </div>
        <div class="flex items-center gap-2 sm:gap-5 text-[11px] font-mono text-muted-foreground">
          <button
            v-if="alarms.urgent.value > 0"
            :class="[
              'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md transition border-2',
              urgentChipClass,
            ]"
            :title="`${alarms.active.value} alarmes capteur · ${alarms.openSignalements.value} signalements ouverts`"
            @click="router.push({ name: 'admin-alarms' })"
          >
            <span :class="['size-1.5 rounded-full pulse-dot', urgentDotClass]" />
            <span class="tabular">{{ alarms.urgent.value }}</span>
            <span class="hidden sm:inline">à traiter</span>
          </button>
          <button
            v-if="alarms.openInterventions.value > 0"
            class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md transition border-2 border-signal/40 bg-signal/10 text-signal hover:bg-signal/20"
            :title="`${alarms.openInterventions.value} interventions ouvertes`"
            @click="router.push({ name: 'admin-interventions' })"
          >
            <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span class="tabular">{{ alarms.openInterventions.value }}</span>
            <span class="hidden sm:inline">interv.</span>
          </button>
          <span class="hidden sm:flex items-center gap-1.5">
            <span class="size-1 rounded-full bg-signal pulse-dot" />
            <span class="uppercase tracking-wider">Live</span>
          </span>
          <span class="tabular text-[10px] sm:text-[11px]">{{ clock }}</span>
          <button
            :title="theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'"
            class="ml-1 size-7 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 hover:text-foreground transition"
            @click="toggleTheme"
          >
            <svg v-if="theme === 'dark'" viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <svg v-else viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
          </button>
        </div>
      </header>

      <main class="flex-1 hex-grid overflow-auto">
        <RouterView v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>

      <footer class="border-t border-border bg-card/40 px-6 py-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>Hexa.ai · myHexa edge ops</span>
        <span class="flex items-center gap-3">
          <span>build 2026.05.15</span>
          <span class="text-signal">●</span>
        </span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.page-enter-active, .page-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.page-enter-from { opacity: 0; transform: translateY(4px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
