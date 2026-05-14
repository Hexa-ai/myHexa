# P1 — Bootstrap & Deploy Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Vue.js squelette déployée sur Netlify avec stack complète (TS + Vite + Tailwind + shadcn-vue + Supabase client + Pinia + Vue Router) et CI GitHub Actions verte.

**Architecture :** Mono-repo dans `Dev-myHexa/`. App Vue dans `app/`. SPA pure, build statique servi par Netlify. Aucun comportement métier dans cette phase, juste le squelette infra opérationnel.

**Tech Stack :** Vue 3 + TypeScript + Vite + Vue Router + Pinia + Tailwind CSS + shadcn-vue + @supabase/supabase-js + pnpm + Vitest + ESLint + Prettier + GitHub Actions + Netlify.

**Prérequis :**
- Node.js ≥ 20 installé
- pnpm installé (`npm install -g pnpm`)
- Compte Netlify + compte GitHub
- Variables Supabase disponibles (URL + anon key)

---

## File Structure

```
app/                              ← nouveau
├── .env.example
├── .eslintrc.cjs
├── .gitignore
├── .prettierrc
├── index.html
├── netlify.toml
├── package.json
├── pnpm-lock.yaml
├── postcss.config.cjs
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── components.json              ← config shadcn-vue
├── public/
│   └── favicon.ico
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── style.css
│   ├── router/index.ts
│   ├── stores/auth.ts           ← skeleton vide à ce stade
│   ├── lib/supabase.ts
│   ├── lib/api.ts               ← skeleton vide
│   ├── views/HomeView.vue
│   └── components/ui/           ← géré par shadcn-vue CLI
└── tests/
    └── unit/example.spec.ts

.github/
└── workflows/
    └── ci.yml
```

---

### Task 1 : Créer le squelette Vue + Vite + TypeScript

**Files:**
- Create: `app/` (dossier complet via Vite)

- [ ] **Step 1.1 : Scaffolder le projet**

Run depuis `Dev-myHexa/` :
```bash
pnpm create vite@latest app -- --template vue-ts
```

Attendu : dossier `app/` créé avec structure Vite standard.

- [ ] **Step 1.2 : Installer les dépendances**

```bash
cd app && pnpm install
```

- [ ] **Step 1.3 : Vérifier que le serveur dev démarre**

```bash
pnpm dev
```

Attendu : serveur dispo sur `http://localhost:5173`. Ouvrir dans le navigateur, vérifier la page Vite par défaut. Couper avec Ctrl+C.

- [ ] **Step 1.4 : Commit**

```bash
git add app/
git commit -m "feat(p1): scaffold Vue 3 + TS app via Vite"
```

---

### Task 2 : Configurer Tailwind CSS

**Files:**
- Create: `app/tailwind.config.ts`, `app/postcss.config.cjs`
- Modify: `app/src/style.css`, `app/src/main.ts`

- [ ] **Step 2.1 : Installer Tailwind et ses peers**

```bash
cd app && pnpm add -D tailwindcss postcss autoprefixer @types/node
pnpm exec tailwindcss init -p --ts
```

Attendu : `tailwind.config.ts` et `postcss.config.js` créés. Renommer `postcss.config.js` en `postcss.config.cjs` si nécessaire.

- [ ] **Step 2.2 : Configurer Tailwind**

Remplacer le contenu de `app/tailwind.config.ts` :

```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {},
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2.3 : Ajouter les directives Tailwind**

Remplacer le contenu de `app/src/style.css` :

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2.4 : Vérifier que Tailwind fonctionne**

Modifier `app/src/App.vue` temporairement pour ajouter une classe Tailwind :

```vue
<template>
  <div class="p-8 text-3xl font-bold text-blue-600">
    Hello myHexa
  </div>
</template>
```

Run `pnpm dev`, vérifier visuellement le rendu Tailwind. Couper.

- [ ] **Step 2.5 : Commit**

```bash
git add -A
git commit -m "feat(p1): add Tailwind CSS"
```

---

### Task 3 : Configurer le path alias `@`

**Files:**
- Modify: `app/tsconfig.json`, `app/tsconfig.node.json`, `app/vite.config.ts`

- [ ] **Step 3.1 : Mettre à jour `tsconfig.json`**

Ajouter dans `compilerOptions` :

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 3.2 : Mettre à jour `vite.config.ts`**

Remplacer par :

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 3.3 : Vérifier que ça build**

```bash
pnpm build
```

Attendu : build réussit, `dist/` créé.

- [ ] **Step 3.4 : Commit**

```bash
git add -A
git commit -m "feat(p1): add @ path alias"
```

---

### Task 4 : Installer Vue Router + Pinia

**Files:**
- Create: `app/src/router/index.ts`, `app/src/stores/auth.ts`, `app/src/views/HomeView.vue`
- Modify: `app/src/main.ts`, `app/src/App.vue`

- [ ] **Step 4.1 : Installer**

```bash
cd app && pnpm add vue-router pinia
```

- [ ] **Step 4.2 : Créer la vue Home**

Créer `app/src/views/HomeView.vue` :

```vue
<script setup lang="ts"></script>

<template>
  <main class="p-8">
    <h1 class="text-3xl font-bold">myHexa</h1>
    <p class="mt-2 text-gray-600">App en construction.</p>
  </main>
</template>
```

- [ ] **Step 4.3 : Créer le router**

Créer `app/src/router/index.ts` :

```ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
  ],
})
```

- [ ] **Step 4.4 : Créer le store auth (skeleton)**

Créer `app/src/stores/auth.ts` :

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<unknown>(null)
  const recipient = ref<unknown>(null)

  return { session, recipient }
})
```

- [ ] **Step 4.5 : Câbler dans `main.ts`**

Remplacer `app/src/main.ts` :

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/router'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

- [ ] **Step 4.6 : Mettre `<RouterView />` dans App.vue**

Remplacer `app/src/App.vue` :

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 4.7 : Vérifier**

```bash
pnpm dev
```

Ouvrir `http://localhost:5173`, vérifier la page Home. Couper.

- [ ] **Step 4.8 : Commit**

```bash
git add -A
git commit -m "feat(p1): add Vue Router + Pinia skeleton"
```

---

### Task 5 : Installer shadcn-vue

**Files:**
- Create: `app/components.json`, `app/src/lib/utils.ts`, `app/src/components/ui/button/`

- [ ] **Step 5.1 : Initialiser shadcn-vue**

```bash
cd app && pnpm dlx shadcn-vue@latest init
```

Réponses interactives :
- Style: `Default`
- Base color: `Slate`
- CSS variables: `Yes`
- Tailwind config: `tailwind.config.ts`
- Aliases: défauts (`@/components`, `@/lib/utils`)

Attendu : `components.json` créé, `src/lib/utils.ts` créé, `style.css` mis à jour avec variables CSS shadcn.

- [ ] **Step 5.2 : Ajouter un composant Button pour vérifier**

```bash
pnpm dlx shadcn-vue@latest add button
```

Attendu : `src/components/ui/button/` créé.

- [ ] **Step 5.3 : Tester le bouton**

Modifier `app/src/views/HomeView.vue` :

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
</script>

<template>
  <main class="p-8 space-y-4">
    <h1 class="text-3xl font-bold">myHexa</h1>
    <Button>Test</Button>
  </main>
</template>
```

Run `pnpm dev`, vérifier le rendu du bouton. Couper.

- [ ] **Step 5.4 : Commit**

```bash
git add -A
git commit -m "feat(p1): install shadcn-vue + Button component"
```

---

### Task 6 : Configurer le client Supabase

**Files:**
- Create: `app/src/lib/supabase.ts`, `app/src/lib/api.ts`, `app/.env.example`
- Modify: `app/.gitignore`

- [ ] **Step 6.1 : Installer**

```bash
cd app && pnpm add @supabase/supabase-js
```

- [ ] **Step 6.2 : Créer `.env.example`**

Créer `app/.env.example` :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_EDGE_FUNCTIONS_URL=https://xxxxx.supabase.co/functions/v1
```

- [ ] **Step 6.3 : Créer `.env.local` (non versionné)**

Créer `app/.env.local` avec les vraies valeurs (récupérables via `mcp__supabase__get_project_url` + `mcp__supabase__get_publishable_keys`).

Vérifier que `app/.gitignore` contient bien `.env.local` (Vite le génère par défaut).

- [ ] **Step 6.4 : Créer le client**

Créer `app/src/lib/supabase.ts` :

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 6.5 : Créer le wrapper API (skeleton)**

Créer `app/src/lib/api.ts` :

```ts
const EDGE_URL = import.meta.env.VITE_EDGE_FUNCTIONS_URL

if (!EDGE_URL) {
  throw new Error('Missing VITE_EDGE_FUNCTIONS_URL')
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export async function callEdge<T>(
  fn: string,
  params: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${EDGE_URL}/${fn}${qs ? '?' + qs : ''}`)
  return res.json() as Promise<ApiResponse<T>>
}
```

- [ ] **Step 6.6 : Vérifier que le build passe**

```bash
pnpm build
```

Attendu : build réussit (les imports sont valides même sans .env en CI, voir Task 9).

- [ ] **Step 6.7 : Commit**

```bash
git add -A
git commit -m "feat(p1): configure Supabase client + API wrapper"
```

---

### Task 7 : Configurer ESLint + Prettier

**Files:**
- Create: `app/.eslintrc.cjs`, `app/.prettierrc`

- [ ] **Step 7.1 : Installer**

```bash
cd app && pnpm add -D eslint @vue/eslint-config-typescript @vue/eslint-config-prettier eslint-plugin-vue prettier vue-tsc
```

- [ ] **Step 7.2 : Créer `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  env: { node: true, browser: true },
  extends: [
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-typescript',
    '@vue/eslint-config-prettier',
  ],
  parserOptions: { ecmaVersion: 'latest' },
  rules: {
    'vue/multi-word-component-names': 'off',
  },
}
```

- [ ] **Step 7.3 : Créer `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 7.4 : Ajouter les scripts au `package.json`**

Modifier la section `scripts` de `app/package.json` :

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .vue,.ts,.tsx --fix",
    "format": "prettier --write src/",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

- [ ] **Step 7.5 : Lancer le lint pour vérifier**

```bash
pnpm lint
pnpm typecheck
```

Attendu : aucune erreur.

- [ ] **Step 7.6 : Commit**

```bash
git add -A
git commit -m "feat(p1): add ESLint + Prettier configs"
```

---

### Task 8 : Configurer Vitest + premier test

**Files:**
- Create: `app/vitest.config.ts`, `app/tests/unit/example.spec.ts`

- [ ] **Step 8.1 : Installer**

```bash
cd app && pnpm add -D vitest @vue/test-utils jsdom
```

- [ ] **Step 8.2 : Créer `vitest.config.ts`**

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 8.3 : Écrire un test smoke**

Créer `app/tests/unit/example.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8.4 : Ajouter le script `test:unit`**

Dans `app/package.json` :

```json
{
  "scripts": {
    "test:unit": "vitest run"
  }
}
```

- [ ] **Step 8.5 : Lancer**

```bash
pnpm test:unit
```

Attendu : 1 test passe.

- [ ] **Step 8.6 : Commit**

```bash
git add -A
git commit -m "feat(p1): add Vitest setup + smoke test"
```

---

### Task 9 : Configurer Netlify

**Files:**
- Create: `app/netlify.toml`

- [ ] **Step 9.1 : Créer `netlify.toml`**

Créer `app/netlify.toml` :

```toml
[build]
  base = "app"
  command = "pnpm install --frozen-lockfile && pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS = "--version"  # désactive npm, on utilise pnpm

# SPA fallback : toutes les routes inconnues retournent index.html
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# Headers de sécurité de base
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

- [ ] **Step 9.2 : Connecter le repo à Netlify (manuel)**

Action utilisateur (hors plan automatisable) :
1. Aller sur app.netlify.com → New site from Git
2. Sélectionner le repo `Dev-myHexa` (à pousser sur GitHub d'abord — voir Task 11)
3. Build settings : Netlify détectera `app/netlify.toml`
4. Configurer les env vars : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EDGE_FUNCTIONS_URL`
5. Déployer une première fois

**Cette étape se fait après Task 11 (push GitHub).** Marquer cette tâche comme terminée une fois le déploiement réussi et l'URL Netlify obtenue.

- [ ] **Step 9.3 : Commit le fichier**

```bash
git add app/netlify.toml
git commit -m "feat(p1): add Netlify config"
```

---

### Task 10 : Configurer GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 10.1 : Créer le workflow**

Créer `.github/workflows/ci.yml` :

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  app:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: app/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint --no-fix

      - name: Unit tests
        run: pnpm test:unit

      - name: Build
        run: pnpm build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_EDGE_FUNCTIONS_URL: ${{ secrets.VITE_EDGE_FUNCTIONS_URL }}
```

- [ ] **Step 10.2 : Note utilisateur — secrets GitHub**

Action utilisateur : ajouter les 3 secrets dans `Settings → Secrets and variables → Actions` du repo GitHub :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_EDGE_FUNCTIONS_URL`

- [ ] **Step 10.3 : Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(p1): add GitHub Actions CI"
```

---

### Task 11 : Pousser sur GitHub

**Files:** aucun (commande seulement)

- [ ] **Step 11.1 : Créer le repo GitHub (manuel)**

Action utilisateur : créer un repo privé `myHexa` (ou autre nom) sur GitHub. Récupérer l'URL SSH.

- [ ] **Step 11.2 : Pousser**

```bash
git remote add origin git@github.com:<user>/<repo>.git
git branch -M main
git push -u origin main
```

- [ ] **Step 11.3 : Vérifier la CI**

Aller sur l'onglet Actions du repo. Le workflow doit tourner et passer au vert.

Si rouge : ouvrir les logs, corriger, recommit, repush.

---

### Task 12 : Première mise en prod sur Netlify

**Files:** aucun

- [ ] **Step 12.1 : Déclencher le déploiement**

Action utilisateur : suivre Step 9.2 ci-dessus. Récupérer l'URL temporaire Netlify (`xxx.netlify.app`).

- [ ] **Step 12.2 : Vérifier en prod**

Ouvrir l'URL Netlify dans un navigateur. La page Home doit s'afficher avec le bouton "Test". Aucune erreur en console.

- [ ] **Step 12.3 : Mettre à jour la mémoire (manuel)**

Demander à l'agent de sauvegarder dans la mémoire `myhexa_vue_app_url.md` l'URL Netlify obtenue + le nom du repo GitHub.

---

## Self-Review

- Spec section 3 (stack) : ✓ Tasks 1-8 couvrent tout
- Spec section 5 (structure de code) : ✓ partiellement (le squelette est en place, le reste arrive aux plans suivants)
- Spec section 7-8 (data flow, errors) : déférés aux plans P2-P4
- Spec section 9 (testing) : ✓ Vitest configuré, Playwright dans P5
- Hosting Netlify : ✓ Tasks 9 + 12
- CI : ✓ Task 10
- Pas de placeholders, tous les fichiers ont des chemins exacts, toutes les commandes sont concrètes
