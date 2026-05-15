export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          max_daily_reports: number
          max_weekly_reports: number
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_daily_reports?: number
          max_weekly_reports?: number
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_daily_reports?: number
          max_weekly_reports?: number
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      connectivity_alerts: {
        Row: { device_id: string; last_notified_at: string; state: string }
        Insert: { device_id: string; last_notified_at?: string; state: string }
        Update: { device_id?: string; last_notified_at?: string; state?: string }
        Relationships: [
          {
            foreignKeyName: 'connectivity_alerts_device_id_fkey'
            columns: ['device_id']
            isOneToOne: true
            referencedRelation: 'devices'
            referencedColumns: ['id']
          },
        ]
      }
      devices: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          has_battery: boolean
          has_supercap: boolean
          id: string
          invoice_number: string | null
          last_connection_at: string | null
          latitude: number | null
          longitude: number | null
          mac_eth0: string | null
          name: string
          os_install_date: string | null
          os_version: string | null
          serial_number: string | null
          token: string | null
          updated_at: string
          vnc_host: string | null
          vnc_port: number
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          has_battery?: boolean
          has_supercap?: boolean
          id?: string
          invoice_number?: string | null
          last_connection_at?: string | null
          latitude?: number | null
          longitude?: number | null
          mac_eth0?: string | null
          name: string
          os_install_date?: string | null
          os_version?: string | null
          serial_number?: string | null
          token?: string | null
          updated_at?: string
          vnc_host?: string | null
          vnc_port?: number
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          has_battery?: boolean
          has_supercap?: boolean
          id?: string
          invoice_number?: string | null
          last_connection_at?: string | null
          latitude?: number | null
          longitude?: number | null
          mac_eth0?: string | null
          name?: string
          os_install_date?: string | null
          os_version?: string | null
          serial_number?: string | null
          token?: string | null
          updated_at?: string
          vnc_host?: string | null
          vnc_port?: number
        }
        Relationships: [
          {
            foreignKeyName: 'devices_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      field_interventions: {
        Row: {
          id: string
          device_id: string
          created_at: string
          technician_name: string
          technician_contact: string | null
          category: 'intervention' | 'incident' | 'controle' | 'autre'
          severity: 'info' | 'warning' | 'error'
          message: string | null
          status: 'open' | 'resolved'
          resolved_at: string | null
          resolved_by_recipient_id: string | null
          photo_paths: string[]
        }
        Insert: {
          id?: string
          device_id: string
          created_at?: string
          technician_name: string
          technician_contact?: string | null
          category: 'intervention' | 'incident' | 'controle' | 'autre'
          severity: 'info' | 'warning' | 'error'
          message?: string | null
          status?: 'open' | 'resolved'
          resolved_at?: string | null
          resolved_by_recipient_id?: string | null
        }
        Update: {
          id?: string
          device_id?: string
          created_at?: string
          technician_name?: string
          technician_contact?: string | null
          category?: 'intervention' | 'incident' | 'controle' | 'autre'
          severity?: 'info' | 'warning' | 'error'
          message?: string | null
          status?: 'open' | 'resolved'
          resolved_at?: string | null
          resolved_by_recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'field_interventions_device_id_fkey'
            columns: ['device_id']
            isOneToOne: false
            referencedRelation: 'devices'
            referencedColumns: ['id']
          },
        ]
      }
      recipients: {
        Row: {
          allowed_device_ids: string[] | null
          auth_user_id: string | null
          company_id: string
          contact_email: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          allowed_device_ids?: string[] | null
          auth_user_id?: string | null
          company_id: string
          contact_email?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          allowed_device_ids?: string[] | null
          auth_user_id?: string | null
          company_id?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipients_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      report_tokens: {
        Row: {
          created_at: string
          device_ids: string
          expires_at: string
          recipient_id: string
          token: string
        }
        Insert: {
          created_at?: string
          device_ids: string
          expires_at: string
          recipient_id: string
          token: string
        }
        Update: {
          created_at?: string
          device_ids?: string
          expires_at?: string
          recipient_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: 'report_tokens_recipient_id_fkey'
            columns: ['recipient_id']
            isOneToOne: false
            referencedRelation: 'recipients'
            referencedColumns: ['id']
          },
        ]
      }
      reports: {
        Row: {
          device_id: string
          id: string
          payload: Json
          period_end: string | null
          period_start: string | null
          received_at: string
          type: Database['public']['Enums']['report_type']
        }
        Insert: {
          device_id: string
          id?: string
          payload: Json
          period_end?: string | null
          period_start?: string | null
          received_at?: string
          type: Database['public']['Enums']['report_type']
        }
        Update: {
          device_id?: string
          id?: string
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          received_at?: string
          type?: Database['public']['Enums']['report_type']
        }
        Relationships: [
          {
            foreignKeyName: 'reports_device_id_fkey'
            columns: ['device_id']
            isOneToOne: false
            referencedRelation: 'devices'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      alarm_counts: {
        Args: never
        Returns: {
          active_alarms: number
          open_interventions: number
        }[]
      }
      alarm_history: {
        Args: never
        Returns: {
          device_id: string
          device_name: string | null
          ts: string | null
          variable_name: string | null
          description: string | null
          type_alarm: string | null
          state_label: string | null
        }[]
      }
      current_recipient_company_id: { Args: never; Returns: string }
      devices_with_latest_status: {
        Args: never
        Returns: {
          address: string
          company_id: string
          id: string
          last_connection_at: string
          latitude: number
          longitude: number
          mac_eth0: string
          name: string
          serial_number: string
          status_payload: Json
          status_received_at: string
          vnc_host: string
          vnc_port: number
        }[]
      }
    }
    Enums: { report_type: 'status' | 'daily' | 'weekly' }
    CompositeTypes: { [_ in never]: never }
  }
}
