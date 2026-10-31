<script setup lang="ts">
// Image de marque d'une entreprise : logo (+ variante sombre), site web, couleur, adresse de connexion (slug, staff).
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { publicUrl, removeLogo, removeLogoDark, uploadLogo, uploadLogoDark } from '@/composables/useBranding'
import { loadBrandForCompany } from '@/composables/useBrand'
import { brandVars, contrast, hexToRgb, isAlarmRed } from '@/lib/color'
import { useAuthStore } from '@/stores/auth'
import { isReservedSlug, isValidSlug } from '@/router/reservedSlugs'

const props = defineProps<{ companyId: string; staff?: boolean }>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

const auth = useAuthStore()
const logo = ref<string | null>(null)
const logoDark = ref<string | null>(null)
const website = ref('')
const color = ref('')
const slug = ref('')
const msg = ref('')
const err = ref('')
const busy = ref(false)

async function load() {
  const { data } = await sb
    .from('companies')
    .select('logo_path, logo_dark_path, website, brand_color, slug')
    .eq('id', props.companyId)
    .maybeSingle()
  logo.value = data?.logo_path ? publicUrl(data.logo_path) : null
  logoDark.value = data?.logo_dark_path ? publicUrl(data.logo_dark_path) : null
  website.value = data?.website ?? ''
  color.value = data?.brand_color ?? ''
  slug.value = data?.slug ?? ''
}
onMounted(load)

const colorValid = computed(() => !color.value || !!hexToRgb(color.value))
const colorRed = computed(() => colorValid.value && !!color.value && isAlarmRed(color.value))
const colorTips = computed(() => {
  if (!color.value || !colorValid.value || colorRed.value) return ''
  const c = hexToRgb(color.value)!
  const ratio = contrast(c, [255, 255, 255]).toFixed(1)
  const adaptedDark = brandVars(color.value, 'dark')?.accent
  return `Contraste sur fond blanc : ${ratio}:1. En thème sombre la couleur est éclaircie automatiquement${adaptedDark && adaptedDark.toLowerCase() !== color.value.toLowerCase() ? ` (${adaptedDark})` : ''}.`
})
const slugState = computed(() => {
  const s = slug.value.trim().toLowerCase()
  if (!s) return ''
  if (isReservedSlug(s)) return 'Adresse réservée par le portail.'
  if (!isValidSlug(s)) return '2 à 40 caractères : minuscules, chiffres et tirets.'
  return ''
})
const websiteValid = computed(() => !website.value || /^https?:\/\/[^\s<>"']+$/.test(website.value.trim()))

async function run(fn: () => Promise<void>, ok: string) {
  busy.value = true; msg.value = ''; err.value = ''
  try {
    await fn()
    msg.value = ok
    await load()
    // le portail ne change d'habillage que si c'est l'entreprise en cours
    if (auth.effectiveCompanyId === props.companyId) await loadBrandForCompany(props.companyId)
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const pick = (dark: boolean) => (ev: Event) => {
  const f = (ev.target as HTMLInputElement).files?.[0]
  ;(ev.target as HTMLInputElement).value = ''
  if (f) void run(async () => void (await (dark ? uploadLogoDark : uploadLogo)(props.companyId, f)), 'Logo enregistré.')
}
const saveInfos = () =>
  run(async () => {
    if (!websiteValid.value) throw new Error('Adresse du site : https://…')
    if (!colorValid.value) throw new Error('Couleur : #rrggbb')
    const { error } = await sb.rpc('set_company_branding', {
      p_company: props.companyId, p_website: website.value.trim(), p_brand_color: color.value.trim(),
    })
    if (error) throw new Error(error.message)
    if (props.staff) {
      const { error: e2 } = await sb.rpc('set_company_slug', { p_company: props.companyId, p_slug: slug.value })
      if (e2) throw new Error(e2.message.includes('companies_slug') ? 'Adresse de connexion invalide ou déjà prise.' : e2.message)
    }
  }, 'Enregistré.')
</script>

<template>
  <section class="border border-border rounded-md bg-card/40 p-4 space-y-5" data-testid="branding-panel">
    <div>
      <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">Image de marque</div>
      <p class="text-xs text-muted-foreground">
        Le logo s'affiche dans le portail à côté de celui d'Hexa-AI ; la couleur habille les boutons et accents (le rouge reste réservé aux alarmes).
      </p>
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <div class="space-y-2" data-testid="branding-logo">
        <div class="text-xs text-muted-foreground">Logo (PNG ou JPEG, 2 Mo)</div>
        <div class="h-20 rounded-md border border-border bg-white flex items-center justify-center">
          <img v-if="logo" :src="logo" alt="logo" class="max-h-16 max-w-[90%] object-contain" />
          <span v-else class="text-xs text-neutral-400">aucun logo</span>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <label class="cursor-pointer text-signal hover:underline">
            {{ logo ? 'Changer' : 'Ajouter' }}
            <input type="file" accept="image/png,image/jpeg" class="hidden" data-testid="branding-logo-input" :disabled="busy" @change="pick(false)" />
          </label>
          <button v-if="logo" type="button" class="text-muted-foreground hover:text-foreground" @click="run(() => removeLogo(companyId), 'Logo retiré.')">Retirer</button>
        </div>
      </div>
      <div class="space-y-2" data-testid="branding-logo-dark">
        <div class="text-xs text-muted-foreground">Logo pour le thème sombre (facultatif)</div>
        <div class="h-20 rounded-md border border-border bg-[#11181f] flex items-center justify-center">
          <img v-if="logoDark" :src="logoDark" alt="logo sombre" class="max-h-16 max-w-[90%] object-contain" />
          <span v-else class="text-xs text-muted-foreground">sans : le logo normal sur fond clair</span>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <label class="cursor-pointer text-signal hover:underline">
            {{ logoDark ? 'Changer' : 'Ajouter' }}
            <input type="file" accept="image/png,image/jpeg" class="hidden" :disabled="busy" @change="pick(true)" />
          </label>
          <button v-if="logoDark" type="button" class="text-muted-foreground hover:text-foreground" @click="run(() => removeLogoDark(companyId), 'Logo sombre retiré.')">Retirer</button>
        </div>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="space-y-1 block">
        <span class="text-xs text-muted-foreground">Site web (lien du logo)</span>
        <input v-model="website" data-testid="branding-website" type="url" placeholder="https://www.exemple.fr" class="w-full bg-transparent border-b border-border focus:border-signal focus:outline-none py-1.5 text-sm font-mono" />
      </label>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground">Couleur principale (facultatif)</span>
        <div class="flex items-center gap-2">
          <input type="color" :value="colorValid && color ? color : '#00d4aa'" class="size-8 rounded border border-border bg-transparent p-0.5" @input="color = ($event.target as HTMLInputElement).value" />
          <input v-model="color" data-testid="branding-color" placeholder="#0058A3 (vide = turquoise Hexa-AI)" class="flex-1 bg-transparent border-b border-border focus:border-signal focus:outline-none py-1.5 text-sm font-mono" />
          <button v-if="color" type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="color = ''">Effacer</button>
        </div>
        <p v-if="colorRed" class="text-xs text-warn">Un rouge vif est réservé aux alarmes : il ne sera pas appliqué.</p>
        <p v-else-if="colorTips" class="text-xs text-muted-foreground">{{ colorTips }}</p>
      </div>
    </div>

    <div v-if="staff" class="space-y-1">
      <span class="text-xs text-muted-foreground">Adresse de connexion de l'entreprise (staff)</span>
      <div class="flex items-center gap-1 font-mono text-sm">
        <span class="text-muted-foreground">my.hexa-ai.fr/</span>
        <input v-model="slug" data-testid="branding-slug" placeholder="serpol" class="bg-transparent border-b border-border focus:border-signal focus:outline-none py-1 w-48" />
      </div>
      <p v-if="slugState" class="text-xs text-warn">{{ slugState }}</p>
    </div>

    <div class="flex items-center gap-3">
      <button type="button" data-testid="branding-save" :disabled="busy || !!slugState" class="font-mono text-[11px] uppercase tracking-[0.2em] bg-signal text-primary-foreground px-4 py-2 rounded-md disabled:opacity-50" @click="saveInfos">Enregistrer</button>
      <span v-if="msg" class="text-xs text-signal" data-testid="branding-msg">{{ msg }}</span>
      <span v-if="err" class="text-xs text-offline">{{ err }}</span>
    </div>
  </section>
</template>
