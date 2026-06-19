import { defineStore } from 'pinia'

const STORAGE_KEY = 'vitella_counter'

function loadCount() {
  if (typeof localStorage === 'undefined') return 0
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved !== null ? JSON.parse(saved) : 0
  } catch {
    return 0
  }
}

function saveCount(value) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {}
}

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: loadCount(),
  }),
  actions: {
    increment() {
      this.count++
      saveCount(this.count)
    },
    setCount(val) {
      this.count = val
      saveCount(this.count)
    },
  },
})
