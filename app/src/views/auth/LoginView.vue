<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')

async function handleSubmit() {
  const ok = await auth.signIn(email.value, password.value)
  if (!ok) return
  const redirect = (route.query.redirect as string) || '/admin'
  router.push(redirect)
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4 bg-slate-50">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Connexion myHexa</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input id="email" v-model="email" type="email" required autocomplete="email" />
          </div>
          <div class="space-y-2">
            <Label for="password">Mot de passe</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
            />
          </div>
          <p v-if="auth.error" class="text-sm text-red-600">{{ auth.error }}</p>
          <Button type="submit" class="w-full" :disabled="auth.loading">
            {{ auth.loading ? 'Connexion…' : 'Se connecter' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
