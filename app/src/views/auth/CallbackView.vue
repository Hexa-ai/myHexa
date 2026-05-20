<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const error = ref<string | null>(null)

function targetPath(): string {
  const next = String(route.query.next ?? '')
  if (next && next.startsWith('/')) return next
  return auth.isHexaStaff ? '/admin/staff/companies' : '/admin/devices'
}

onMounted(async () => {
  // Supabase SDK (avec detectSessionInUrl=true) lit déjà le hash du URL
  // dès l'init. On lui laisse une fenêtre pour finaliser, puis on essaie
  // explicitement de récupérer la session.
  try {
    // Petit délai laisse le temps au SDK de traiter le hash
    await new Promise((r) => setTimeout(r, 100))
    const { data, error: getErr } = await supabase.auth.getSession()
    if (getErr) throw getErr
    if (data.session) {
      // Le store écoute onAuthStateChange, recipient va se peupler
      await new Promise((r) => setTimeout(r, 150))
      router.replace(targetPath())
      return
    }

    // Si pas de session dans le hash, peut-être que le lien contient un
    // ?token_hash=&type= (lien email standard) — on tente verifyOtp.
    const tokenHash = route.query.token_hash as string | undefined
    const type = route.query.type as string | undefined
    if (tokenHash && (type === 'magiclink' || type === 'recovery' || type === 'email' || type === 'invite')) {
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'magiclink',
      })
      if (vErr) throw vErr
      await new Promise((r) => setTimeout(r, 150))
      router.replace(targetPath())
      return
    }

    // Rien à exploiter — retour login
    error.value = "Lien d'authentification invalide ou expiré."
    setTimeout(() => router.replace('/login'), 2500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Erreur d’authentification'
    setTimeout(() => router.replace('/login'), 2500)
  }
})
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
    <div class="text-center space-y-3">
      <div v-if="!error" class="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
        <span class="blink">▍</span> Authentification…
      </div>
      <div v-else>
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-2">Erreur</div>
        <p class="text-sm">{{ error }}</p>
        <p class="text-xs text-muted-foreground mt-2">Redirection vers la connexion…</p>
      </div>
    </div>
  </main>
</template>
