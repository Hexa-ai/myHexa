import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<unknown>(null)
  const recipient = ref<unknown>(null)

  return { session, recipient }
})
