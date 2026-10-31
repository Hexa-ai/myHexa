<script setup lang="ts">
/** date de construction (injectée par vite), au lieu d'une date figée */
const buildDate = __BUILD_DATE__
import MobileTabBar from '@/components/layout/MobileTabBar.vue'
import PwaInstallHint from '@/components/PwaInstallHint.vue'
import PwaInstallButton from '@/components/PwaInstallButton.vue'
import { useScrollFocus } from '@/composables/useScrollFocus'
/** listes : sur écran tactile, l'élément au centre de l'écran est mis en avant pendant le défilement */
const mainEl = ref<HTMLElement | null>(null)
useScrollFocus(mainEl, '.neu-card')
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme, styleSwitchAvailable } from '@/composables/useTheme'
import { useAlarmCounts, ALARM_COUNTS_KEY } from '@/composables/useAlarmCounts'
import StaffBar from '@/components/staff/StaffBar.vue'
import CompanyLogo from '@/components/brand/CompanyLogo.vue'
import { loadBrandForCompany, useBrand } from '@/composables/useBrand'

const { theme, toggle: toggleTheme, uiStyle, toggleStyle } = useTheme()
const alarms = useAlarmCounts()
provide(ALARM_COUNTS_KEY, alarms)

const auth = useAuthStore()
// co-branding : logo / couleur de l'entreprise (celle sur laquelle le staff agit, le cas échéant)
const { brand } = useBrand()
watch(() => auth.effectiveCompanyId, (id) => void loadBrandForCompany(id), { immediate: true })
const router = useRouter()
const route = useRoute()

async function handleLogout() {
  await auth.signOut()
  router.push({ name: 'login' })
}

// Les guards du router ne s'exécutent qu'à la navigation : si la session meurt
// pendant que l'utilisateur reste sur une page, rien ne réagit et l'écran garde
// des données mortes. On renvoie donc explicitement vers le login.
watch(
  () => auth.isAuthenticated,
  (authenticated) => {
    if (!authenticated) {
      router.replace({ name: 'login', query: { redirect: route.fullPath } })
    }
  },
)

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const clock = computed(() =>
  now.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
)

const company = computed(() => auth.companyName ?? '—')
const email = computed(() => auth.recipient?.contact_email ?? '—')
const role = computed(() => auth.recipient?.role ?? 'member')

const breadcrumb = computed(() => {
  const map: Record<string, string> = {
    'admin-devices': 'mes box',
    'admin-device-detail': 'mes box / fiche',
    'admin-dashboards': 'tableaux de bord',
    'admin-map': 'carte',
    'admin-projects': 'projets',
    'admin-dashboard': 'tableau de bord',
    'admin-dashboard-shared': 'tableau partagé',
    'admin-alarms': 'alarmes',
    'admin-interventions': 'interventions',
    'admin-recipients': 'destinataires',
    'admin-alarm-recipients': "destinataires d'alarme",
    'staff-companies': 'staff / entreprises',
    'staff-company-detail': 'staff / entreprise',
    'staff-devices': 'parc des box',
    'staff-usage': 'staff / consommation',
    'admin-updates': 'mises à jour',
    'staff-device-new': 'staff / nouvelle box',
  }
  return map[String(route.name ?? '')] ?? String(route.name ?? '')
})

/** 5 touchers sur le titre : active / coupe le diagnostic de hauteur (iPhone) puis recharge */
let diagTaps = 0
let diagTimer: ReturnType<typeof setTimeout> | undefined
function diagTap() {
  diagTaps++
  clearTimeout(diagTimer)
  diagTimer = setTimeout(() => (diagTaps = 0), 1500)
  if (diagTaps < 5) return
  if (localStorage.getItem('hexa.diag')) localStorage.removeItem('hexa.diag')
  else localStorage.setItem('hexa.diag', '1')
  location.reload()
}

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
const isAlarmRecipients = computed(() => route.name === 'admin-alarm-recipients')

const sidebarOpen = ref(false)
// PC : menu réductible en barre d'icônes (choix mémorisé), pour laisser la place aux tableaux de bord
const RAIL_KEY = 'hexa.sidebarCollapsed'
const collapsed = ref(typeof localStorage !== 'undefined' && localStorage.getItem(RAIL_KEY) === '1')
watch(collapsed, (v) => localStorage.setItem(RAIL_KEY, v ? '1' : '0'))
function toggleCollapsed() {
  collapsed.value = !collapsed.value
}
function closeSidebar() {
  sidebarOpen.value = false
}
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function goDevices() {
  router.push({ name: 'admin-devices' })
  closeSidebar()
}
function goMap() {
  router.push({ name: 'admin-map' })
  closeSidebar()
}
function goDashboards() {
  router.push({ name: 'admin-dashboards' })
  closeSidebar()
}
function goProjects() {
  router.push({ name: 'admin-projects' })
  closeSidebar()
}
function goAlarms() {
  router.push({ name: 'admin-alarms' })
  closeSidebar()
}
function goInterventions() {
  router.push({ name: 'admin-interventions' })
  closeSidebar()
}
function goRecipients() {
  router.push({ name: 'admin-recipients' })
  closeSidebar()
}
function goAlarmRecipients() {
  router.push({ name: 'admin-alarm-recipients' })
  closeSidebar()
}
function goStaff() {
  router.push({ name: 'staff-companies' })
  closeSidebar()
}
function goUpdates() {
  router.push({ name: 'admin-updates' })
  closeSidebar()
}
const isDevices = computed(
  () => route.name === 'admin-devices' || route.name === 'admin-device-detail',
)
const isMap = computed(() => route.name === 'admin-map')
const isProjects = computed(() => route.name === 'admin-projects')
const isDashboards = computed(
  () =>
    route.name === 'admin-dashboards' ||
    route.name === 'admin-dashboard' ||
    route.name === 'admin-dashboard-shared',
)
const isAlarms = computed(() => route.name === 'admin-alarms')
const mobileTab = computed(() =>
  isDevices.value
    ? 'devices'
    : isDashboards.value
      ? 'dashboards'
      : isProjects.value
        ? 'projects'
        : isAlarms.value
          ? 'alarms'
          : null,
)
function goTab(k: 'devices' | 'dashboards' | 'projects' | 'alarms') {
  ;({ devices: goDevices, dashboards: goDashboards, projects: goProjects, alarms: goAlarms })[k]()
}
const isUpdates = computed(() => route.name === 'admin-updates')
const isFleet = computed(() => String(route.name ?? '').startsWith('staff-device'))
const isUsage = computed(() => route.name === 'staff-usage')
const isStaff = computed(
  () => String(route.name ?? '').startsWith('staff-') && !isFleet.value && !isUsage.value,
)
function goFleet() {
  router.push({ name: 'staff-devices' })
  closeSidebar()
}
function goUsage() {
  router.push({ name: 'staff-usage' })
  closeSidebar()
}
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
        'fixed md:static inset-y-0 left-0 w-64 shrink-0 border-r border-border bg-card md:bg-card/60 backdrop-blur-sm flex flex-col z-40 transition-[transform,width] md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed && 'rail md:w-16',
      ]"
      data-testid="sidebar"
    >
      <!-- Logo -->
      <div
        v-if="collapsed"
        class="hidden md:flex flex-col items-center gap-2 pt-5 pb-4 border-b border-border"
      >
        <CompanyLogo v-if="brand?.logoUrl" height-class="h-7" testid="brand-logo-rail" />
        <img
          v-else
          src="/hexa-mark.png"
          alt="Hexa-AI"
          class="size-8 select-none"
          :title="company"
          draggable="false"
        />
      </div>
      <div :class="['px-5 pt-6 pb-5 border-b border-border', collapsed && 'md:hidden']">
        <div v-if="brand?.logoUrl" data-testid="brand-block">
          <CompanyLogo height-class="h-11" testid="brand-logo" />
        </div>
        <img
          v-else
          :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
          alt="Hexa.ai"
          class="h-9 w-[140px] object-contain object-left select-none"
          data-testid="hexa-logo"
          draggable="false"
          @click="diagTap"
        />
        <div class="mt-4 flex items-center justify-between gap-2" data-testid="menu-company" @click="diagTap">
          <div class="flex items-center gap-2 min-w-0">
            <span class="size-1.5 rounded-full bg-signal pulse-dot shrink-0" />
            <span
              class="font-mono text-[11px] uppercase tracking-wider text-muted-foreground truncate"
              >{{ company }}</span
            >
          </div>
          <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-signal/80 shrink-0"
            >Edge</span
          >
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-0.5">
        <button
          :title="collapsed ? 'Mes box' : undefined"
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
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
            <path d="M3 7l9 5 9-5M12 12v10" stroke-opacity="0.5" />
          </svg>
          <span class="tracking-tight">Mes box</span>
          <span
            v-if="isDevices"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
            >●</span
          >
        </button>

        <button
          :title="collapsed ? 'Carte' : undefined"
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
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M1 6v17l7-3 8 3 7-3V3l-7 3-8-3-7 3Z" />
            <path d="M8 3v17M16 6v17" stroke-opacity="0.5" />
          </svg>
          <span class="tracking-tight">Carte</span>
          <span
            v-if="isMap"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
            >●</span
          >
        </button>

        <button
          :title="collapsed ? 'Tableaux de bord' : undefined"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isDashboards
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          data-testid="nav-dashboards"
          @click="goDashboards"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isDashboards ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          >
            <path d="M4 15a8 8 0 1 1 16 0" />
            <path d="M12 15l4-4" />
            <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
            <path d="M4 19h16" stroke-opacity="0.5" />
          </svg>
          <span class="tracking-tight">Tableaux de bord</span>
        </button>

        <button
          :title="collapsed ? 'Projets' : undefined"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isProjects
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          data-testid="nav-projects"
          @click="goProjects"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isProjects ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" stroke-opacity="0.5" />
            <rect x="14" y="14" width="7" height="7" rx="1" stroke-opacity="0.5" />
          </svg>
          <span class="tracking-tight">Projets</span>
          <span
            v-if="isProjects"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
            >●</span
          >
        </button>

        <button
          :title="collapsed ? 'Alarmes' : undefined"
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
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
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
          :title="collapsed ? 'Interventions' : undefined"
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
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path
              d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
            />
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
          :title="collapsed ? 'Destinataires' : undefined"
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
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span class="tracking-tight">Destinataires</span>
          <span
            v-if="isRecipients"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
            >●</span
          >
        </button>
        <button
          :title="collapsed ? 'Alertes · destinataires' : undefined"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isAlarmRecipients
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goAlarmRecipients"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isAlarmRecipients ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span class="tracking-tight">Alertes · destinataires</span>
          <span
            v-if="isAlarmRecipients"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
            >●</span
          >
        </button>
        <button
          :title="collapsed ? 'Mises à jour' : undefined"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isUpdates
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          data-testid="nav-updates"
          @click="goUpdates"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isUpdates ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M12 3v12M7 10l5 5 5-5" />
            <path d="M4 17v3h16v-3" />
          </svg>
          <span class="tracking-tight">Mises à jour</span>
        </button>

        <button
          v-if="isAdmin"
          :title="collapsed ? 'Mon entreprise' : undefined"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            route.name === 'admin-branding'
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          data-testid="nav-branding"
          @click="router.push({ name: 'admin-branding' }); closeSidebar()"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              route.name === 'admin-branding' ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h4" />
          </svg>
          <span class="tracking-tight">Mon entreprise</span>
        </button>

        <div v-if="auth.isHexaStaff" class="my-3 border-t border-border" />

        <button
          v-if="auth.isHexaStaff"
          :title="collapsed ? 'Staff' : undefined"
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
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
          </svg>
          <span class="tracking-tight">Staff</span>
          <span
            v-if="isStaff"
            class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal"
            >●</span
          >
        </button>
        <button
          v-if="auth.isHexaStaff"
          :title="collapsed ? 'Parc des box' : undefined"
          data-testid="nav-fleet"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isFleet
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goFleet"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isFleet ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M3 7l9-4 9 4-9 4-9-4Z" />
            <path d="M3 7v10l9 4 9-4V7" />
            <path d="M12 11v10" />
          </svg>
          <span class="tracking-tight">Parc des box</span>
        </button>
        <button
          v-if="auth.isHexaStaff"
          :title="collapsed ? 'Consommation' : undefined"
          data-testid="nav-usage"
          :class="[
            'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
            isUsage
              ? 'text-foreground bg-secondary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          ]"
          @click="goUsage"
        >
          <span
            :class="[
              'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
              isUsage ? 'bg-signal' : 'bg-transparent',
            ]"
          />
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
            <path d="M4.5 5.5v6.5c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V5.5" />
            <path d="M4.5 12v6.5c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V12" />
          </svg>
          <span class="tracking-tight">Consommation</span>
        </button>
      </nav>

      <!-- Session -->
      <div
        v-if="collapsed"
        class="hidden md:flex flex-col items-center gap-3 border-t border-border py-3"
      >
        <button
          class="text-muted-foreground hover:text-signal transition"
          :title="`Se déconnecter (${email})`"
          @click="handleLogout"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
      <div :class="['border-t border-border px-4 py-4 space-y-2.5', collapsed && 'md:hidden']">
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Session
        </div>
        <div class="text-xs truncate">{{ email }}</div>
        <!-- téléphone : la barre du haut est masquée, les bascules d'affichage sont ici -->
        <div class="md:hidden flex items-center gap-2" data-testid="mobile-prefs">
          <button
            data-testid="theme-toggle-menu"
            class="h-8 px-3 inline-flex items-center gap-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition font-mono text-[10px] uppercase tracking-wider"
            @click="toggleTheme"
          >
            <svg v-if="theme === 'dark'" viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <svg v-else viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
            {{ theme === 'dark' ? 'Thème clair' : 'Thème sombre' }}
          </button>
          <button
            v-if="styleSwitchAvailable"
            data-testid="style-switch-menu"
            class="h-8 px-3 inline-flex items-center rounded-md border border-border text-muted-foreground hover:text-foreground transition font-mono text-[10px]"
            @click="toggleStyle"
          >
            {{ uiStyle === 'appareil' ? 'classique' : 'appareil' }}
          </button>
        </div>
        <div class="flex items-center justify-between">
          <span
            class="font-mono text-[10px] uppercase px-1.5 py-0.5 border border-hairline rounded text-muted-foreground bg-secondary/60"
          >
            {{ role }}
          </span>
          <button
            class="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
            @click="handleLogout"
          >
            déconnexion ↗
          </button>
        </div>
      </div>
      <div class="px-3 pb-2"><PwaInstallButton :collapsed="collapsed" /></div>
      <a
        href="https://hexa-ai.fr"
        target="_blank"
        rel="noopener noreferrer"
        class="md:hidden px-4 pb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
        data-testid="powered-by-menu"
        >propulsé par Hexa-AI · version {{ buildDate }}</a
      >
      <button
        class="hidden md:flex items-center justify-center gap-2 border-t border-border py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
        :title="collapsed ? 'Déplier le menu' : 'Réduire le menu'"
        data-testid="sidebar-toggle"
        @click="toggleCollapsed"
      >
        <svg
          viewBox="0 0 24 24"
          :class="['size-4 transition-transform', collapsed && 'rotate-180']"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span v-if="!collapsed">Réduire</span>
      </button>
    </aside>

    <div class="flex-1 flex flex-col min-w-0">
      <StaffBar v-if="auth.isHexaStaff" />
      <header
        class="hidden md:flex h-12 border-b border-border bg-background/60 backdrop-blur-sm items-center justify-between px-3 sm:px-5 md:px-6"
        data-testid="topbar"
      >
        <div
          class="flex items-center gap-2 sm:gap-2.5 text-xs font-mono text-muted-foreground min-w-0"
        >
          <button
            class="md:hidden size-8 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 text-muted-foreground hover:text-foreground transition shrink-0"
            aria-label="Menu"
            @click="toggleSidebar"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <img v-if="!brand?.logoUrl" src="/hexa-mark.png" alt="" class="hidden sm:inline size-4" draggable="false" />
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
            <svg
              viewBox="0 0 24 24"
              class="size-3"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
              />
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
            v-if="styleSwitchAvailable"
            data-testid="style-switch"
            :title="
              uiStyle === 'appareil' ? 'Revenir au style classique' : 'Essayer le style appareil'
            "
            class="ml-1 h-7 px-2.5 inline-flex items-center rounded-md border border-border hover:text-foreground transition font-mono text-[10px]"
            @click="toggleStyle"
          >
            {{ uiStyle === 'appareil' ? 'classique' : 'appareil' }}
          </button>
          <button
            :title="theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'"
            class="ml-1 size-7 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 hover:text-foreground transition"
            @click="toggleTheme"
          >
            <svg
              v-if="theme === 'dark'"
              viewBox="0 0 24 24"
              class="size-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              class="size-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
          </button>
        </div>
      </header>

      <main ref="mainEl" class="flex-1 hex-grid overflow-auto">
        <RouterView v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>

      <footer
        class="border-t border-border bg-card/40 px-6 py-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
      >
        <a
          href="https://hexa-ai.fr"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-signal transition"
          data-testid="powered-by"
          >propulsé par Hexa-AI</a
        >
        <span class="flex items-center gap-3">
          <span>version {{ buildDate }}</span>
          <span class="text-signal">●</span>
        </span>
      </footer>
      <MobileTabBar
        :active="mobileTab"
        :alarms="alarms.urgent.value"
        :interventions="alarms.openInterventions.value"
        :menu-open="sidebarOpen"
        @go="goTab"
        @menu="toggleSidebar"
      />
    </div>
    <PwaInstallHint />
  </div>
</template>

<style scoped>
/* menu réduit (PC) : icônes seules, compteurs en pastille */
@media (min-width: 768px) {
  .rail nav {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  .rail nav button {
    justify-content: center;
    padding-left: 0;
    padding-right: 0;
  }
  .rail nav button > span.tracking-tight,
  .rail nav button > span.ml-auto:not(.tabular) {
    display: none;
  }
  .rail nav button > span.tabular {
    position: absolute;
    top: 1px;
    right: 2px;
    margin: 0;
    padding: 0 3px;
    font-size: 9px;
    line-height: 14px;
  }
}
.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
