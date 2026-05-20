export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          is_hexa_internal: boolean
          latitude: number | null
          longitude: number | null
          max_daily_reports: number
          max_weekly_reports: number
          name: string
          phone: string | null
          status_email_frequency: Database["public"]["Enums"]["status_email_frequency"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          is_hexa_internal?: boolean
          latitude?: number | null
          longitude?: number | null
          max_daily_reports?: number
          max_weekly_reports?: number
          name: string
          phone?: string | null
          status_email_frequency?: Database["public"]["Enums"]["status_email_frequency"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          is_hexa_internal?: boolean
          latitude?: number | null
          longitude?: number | null
          max_daily_reports?: number
          max_weekly_reports?: number
          name?: string
          phone?: string | null
          status_email_frequency?: Database["public"]["Enums"]["status_email_frequency"]
          updated_at?: string
        }
        Relationships: []
      }
      connectivity_alerts: {
        Row: {
          device_id: string
          last_notified_at: string
          state: string
        }
        Insert: {
          device_id: string
          last_notified_at?: string
          state: string
        }
        Update: {
          device_id?: string
          last_notified_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectivity_alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
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
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      field_interventions: {
        Row: {
          category: string
          created_at: string
          device_id: string
          id: string
          kind: string
          message: string | null
          photo_paths: string[]
          resolved_at: string | null
          resolved_by_recipient_id: string | null
          severity: string
          status: string
          technician_contact: string | null
          technician_name: string
          technician_phone: string | null
        }
        Insert: {
          category: string
          created_at?: string
          device_id: string
          id?: string
          kind?: string
          message?: string | null
          photo_paths?: string[]
          resolved_at?: string | null
          resolved_by_recipient_id?: string | null
          severity: string
          status?: string
          technician_contact?: string | null
          technician_name: string
          technician_phone?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          device_id?: string
          id?: string
          kind?: string
          message?: string | null
          photo_paths?: string[]
          resolved_at?: string | null
          resolved_by_recipient_id?: string | null
          severity?: string
          status?: string
          technician_contact?: string | null
          technician_name?: string
          technician_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_interventions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_interventions_resolved_by_recipient_id_fkey"
            columns: ["resolved_by_recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipients: {
        Row: {
          auth_user_id: string
          company_id: string | null
          contact_email: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          restrict_to_devices: string[] | null
          role: string
          shared_devices: string[] | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          company_id?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          restrict_to_devices?: string[] | null
          role?: string
          shared_devices?: string[] | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          company_id?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          restrict_to_devices?: string[] | null
          role?: string
          shared_devices?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
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
            foreignKeyName: "report_tokens_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
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
          type: Database["public"]["Enums"]["report_type"]
        }
        Insert: {
          device_id: string
          id?: string
          payload: Json
          period_end?: string | null
          period_start?: string | null
          received_at?: string
          type: Database["public"]["Enums"]["report_type"]
        }
        Update: {
          device_id?: string
          id?: string
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          received_at?: string
          type?: Database["public"]["Enums"]["report_type"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      alarm_counts: {
        Args: { p_company_id: string }
        Returns: {
          active_alarms: number
          max_severity: string
          open_interventions: number
          open_signalements: number
        }[]
      }
      alarm_history: {
        Args: never
        Returns: {
          description: string
          device_id: string
          device_name: string
          state_label: string
          ts: string
          type_alarm: string
          variable_name: string
        }[]
      }
      current_recipient_company_id: { Args: never; Returns: string }
      current_recipient_is_admin: { Args: never; Returns: boolean }
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
      is_hexa_staff: { Args: never; Returns: boolean }
      is_hexa_staff_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      report_type: "status" | "daily" | "weekly"
      status_email_frequency: "none" | "daily" | "weekly"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      report_type: ["status", "daily", "weekly"],
      status_email_frequency: ["none", "daily", "weekly"],
    },
  },
} as const
