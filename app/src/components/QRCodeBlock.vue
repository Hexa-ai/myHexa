<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = withDefaults(
  defineProps<{
    value: string
    size?: number
    label?: string
    sublabel?: string
    /** Filename (without extension) for downloads */
    download?: string
  }>(),
  { size: 220, label: '', sublabel: '', download: 'qrcode' },
)

const svgString = ref<string>('')
const pngDataUrl = ref<string>('')

async function generate() {
  try {
    svgString.value = await QRCode.toString(props.value, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0f14', light: '#ffffff' },
    })
    pngDataUrl.value = await QRCode.toDataURL(props.value, {
      type: 'image/png',
      margin: 1,
      errorCorrectionLevel: 'M',
      width: 600,
      color: { dark: '#0a0f14', light: '#ffffff' },
    })
  } catch (e) {
    svgString.value = ''
    pngDataUrl.value = ''
    console.error('[QRCode] generation failed', e)
  }
}

watch(() => props.value, generate, { immediate: true })

const safeName = computed(() => props.download.replace(/[^a-z0-9_-]+/gi, '_'))

function downloadFile(href: string, ext: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = `${safeName.value}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function downloadSvg() {
  if (!svgString.value) return
  const blob = new Blob([svgString.value], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  downloadFile(url, 'svg')
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadPng() {
  if (!pngDataUrl.value) return
  downloadFile(pngDataUrl.value, 'png')
}
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <div
      class="bg-white p-3 rounded-md shadow-sm"
      :style="{ width: `${size}px`, height: `${size}px` }"
      v-html="svgString"
    />

    <div v-if="label || sublabel" class="text-center">
      <div v-if="label" class="font-medium tracking-tight">{{ label }}</div>
      <div v-if="sublabel" class="font-mono text-[11px] text-muted-foreground break-all">{{ sublabel }}</div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="font-mono text-[10px] uppercase tracking-[0.18em] bg-signal text-primary-foreground px-3 py-1.5 rounded-md hover:brightness-110 transition"
        @click="downloadPng"
      >
        PNG
      </button>
      <button
        type="button"
        class="font-mono text-[10px] uppercase tracking-[0.18em] border border-border text-foreground px-3 py-1.5 rounded-md hover:border-signal/60 hover:text-signal transition"
        @click="downloadSvg"
      >
        SVG
      </button>
    </div>
  </div>
</template>

<style scoped>
:deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
