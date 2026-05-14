<script setup lang="ts">
import { onMounted } from 'vue'
import { useDevices } from '@/composables/useDevices'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const { devices, loading, error, load } = useDevices()

onMounted(load)
</script>

<template>
  <section>
    <h2 class="text-2xl font-bold mb-6">Devices</h2>

    <p v-if="loading">Chargement…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Numéro de série</TableHead>
          <TableHead>Dernière connexion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="device in devices" :key="device.id">
          <TableCell>{{ device.name }}</TableCell>
          <TableCell>{{ device.serial_number || '—' }}</TableCell>
          <TableCell>{{ device.last_connection_at || '—' }}</TableCell>
        </TableRow>
        <TableRow v-if="devices.length === 0">
          <TableCell colspan="3" class="text-center text-slate-500">
            Aucun device pour votre entreprise.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>
