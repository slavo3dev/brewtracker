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
      clients: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          geofence_radius_meters: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          geofence_radius_meters?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          geofence_radius_meters?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      machines: {
        Row: {
          client_id: string
          created_at: string
          id: string
          installed_at: string | null
          last_service_at: string | null
          model: string | null
          name: string | null
          qr_code: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["machine_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          installed_at?: string | null
          last_service_at?: string | null
          model?: string | null
          name?: string | null
          qr_code?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          installed_at?: string | null
          last_service_at?: string | null
          model?: string | null
          name?: string | null
          qr_code?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          notes: string | null
          route_date: string
          status: Database["public"]["Enums"]["route_status"]
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          route_date: string
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          route_date?: string
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          arrived_at: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          id: string
          machine_id: string | null
          notes: string | null
          route_id: string
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          sequence_number: number
          skipped_reason: string | null
          status: Database["public"]["Enums"]["stop_status"]
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          machine_id?: string | null
          notes?: string | null
          route_id: string
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sequence_number: number
          skipped_reason?: string | null
          status?: Database["public"]["Enums"]["stop_status"]
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          machine_id?: string | null
          notes?: string | null
          route_id?: string
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sequence_number?: number
          skipped_reason?: string | null
          status?: Database["public"]["Enums"]["stop_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stops_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          clock_in_at: string
          clock_in_latitude: number | null
          clock_in_longitude: number | null
          clock_in_selfie_url: string | null
          clock_out_at: string | null
          clock_out_latitude: number | null
          clock_out_longitude: number | null
          created_at: string
          driver_id: string
          id: string
          is_geofence_override: boolean
          override_by: string | null
          override_reason: string | null
          review_note: string | null
          review_reason: string | null
          review_status: Database["public"]["Enums"]["time_entry_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["time_entry_status"]
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          clock_in_at?: string
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_in_selfie_url?: string | null
          clock_out_at?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          created_at?: string
          driver_id: string
          id?: string
          is_geofence_override?: boolean
          override_by?: string | null
          override_reason?: string | null
          review_note?: string | null
          review_reason?: string | null
          review_status?: Database["public"]["Enums"]["time_entry_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          clock_in_at?: string
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_in_selfie_url?: string | null
          clock_out_at?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          created_at?: string
          driver_id?: string
          id?: string
          is_geofence_override?: boolean
          override_by?: string | null
          override_reason?: string | null
          review_note?: string | null
          review_reason?: string | null
          review_status?: Database["public"]["Enums"]["time_entry_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          region: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          region?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          region?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          geofence_radius_meters: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          geofence_radius_meters?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          geofence_radius_meters?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_region: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_ceo: { Args: never; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      is_field_staff: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "driver" | "tech" | "manager" | "ceo"
      machine_status: "active" | "inactive" | "maintenance" | "retired"
      route_status:
        | "draft"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      stop_status: "pending" | "in_progress" | "completed" | "skipped"
      time_entry_review_status: "pending" | "approved" | "flagged" | "rejected"
      time_entry_status: "open" | "closed" | "flagged" | "manager_override"
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
      app_role: ["driver", "tech", "manager", "ceo"],
      machine_status: ["active", "inactive", "maintenance", "retired"],
      route_status: [
        "draft",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      stop_status: ["pending", "in_progress", "completed", "skipped"],
      time_entry_review_status: ["pending", "approved", "flagged", "rejected"],
      time_entry_status: ["open", "closed", "flagged", "manager_override"],
    },
  },
} as const
