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
      app_settings: {
        Row: {
          created_at: string
          google_review_url: string | null
          id: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_review_url?: string | null
          id?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_review_url?: string | null
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      client_inventory_products: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_required: boolean
          par_level: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          par_level?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          par_level?: number | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_inventory_products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_inventory_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reserve_snapshot_items: {
        Row: {
          base_unit_snapshot: string
          created_at: string
          entered_issue_quantity: number
          entered_loose_quantity: number
          id: string
          issue_unit_snapshot: string
          normalized_quantity: number
          normalized_unit: string
          package_description_snapshot: string | null
          product_id: string
          snapshot_id: string
          units_per_issue_unit_snapshot: number
        }
        Insert: {
          base_unit_snapshot: string
          created_at?: string
          entered_issue_quantity?: number
          entered_loose_quantity?: number
          id?: string
          issue_unit_snapshot: string
          normalized_quantity: number
          normalized_unit: string
          package_description_snapshot?: string | null
          product_id: string
          snapshot_id: string
          units_per_issue_unit_snapshot: number
        }
        Update: {
          base_unit_snapshot?: string
          created_at?: string
          entered_issue_quantity?: number
          entered_loose_quantity?: number
          id?: string
          issue_unit_snapshot?: string
          normalized_quantity?: number
          normalized_unit?: string
          package_description_snapshot?: string | null
          product_id?: string
          snapshot_id?: string
          units_per_issue_unit_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_reserve_snapshot_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reserve_snapshot_items_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "client_reserve_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reserve_snapshots: {
        Row: {
          client_id: string
          created_at: string
          id: string
          machine_id: string
          recorded_at: string
          recorded_by: string
          source_visit_id: string
          stage: Database["public"]["Enums"]["client_reserve_snapshot_stage"]
          stop_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          machine_id: string
          recorded_at: string
          recorded_by: string
          source_visit_id: string
          stage: Database["public"]["Enums"]["client_reserve_snapshot_stage"]
          stop_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          recorded_at?: string
          recorded_by?: string
          source_visit_id?: string
          stage?: Database["public"]["Enums"]["client_reserve_snapshot_stage"]
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reserve_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reserve_snapshots_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reserve_snapshots_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reserve_snapshots_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
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
          service_email: string | null
          signature_required: boolean
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
          service_email?: string | null
          signature_required?: boolean
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
          service_email?: string | null
          signature_required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      inventory_audit_items: {
        Row: {
          audit_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "inventory_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audits: {
        Row: {
          client_id: string
          counted_at: string
          counted_by: string
          created_at: string
          id: string
          machine_id: string
          source_visit_id: string
          stop_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          counted_at: string
          counted_by: string
          created_at?: string
          id?: string
          machine_id: string
          source_visit_id: string
          stop_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          counted_at?: string
          counted_by?: string
          created_at?: string
          id?: string
          machine_id?: string
          source_visit_id?: string
          stop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          client_id: string | null
          created_at: string
          driver_id: string | null
          id: string
          location_type: Database["public"]["Enums"]["inventory_location_type"]
          machine_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          location_type: Database["public"]["Enums"]["inventory_location_type"]
          machine_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          location_type?: Database["public"]["Enums"]["inventory_location_type"]
          machine_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          base_unit_snapshot: string
          created_at: string
          entered_issue_quantity: number
          entered_loose_quantity: number
          from_location_id: string | null
          id: string
          issue_unit_snapshot: string
          machine_id: string | null
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          normalized_quantity: number
          normalized_unit: string
          occurred_at: string
          package_description_snapshot: string | null
          product_id: string
          recorded_by: string
          source_visit_id: string | null
          stop_id: string | null
          to_location_id: string | null
          units_per_issue_unit_snapshot: number
        }
        Insert: {
          base_unit_snapshot: string
          created_at?: string
          entered_issue_quantity?: number
          entered_loose_quantity?: number
          from_location_id?: string | null
          id?: string
          issue_unit_snapshot: string
          machine_id?: string | null
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          normalized_quantity: number
          normalized_unit: string
          occurred_at: string
          package_description_snapshot?: string | null
          product_id: string
          recorded_by: string
          source_visit_id?: string | null
          stop_id?: string | null
          to_location_id?: string | null
          units_per_issue_unit_snapshot: number
        }
        Update: {
          base_unit_snapshot?: string
          created_at?: string
          entered_issue_quantity?: number
          entered_loose_quantity?: number
          from_location_id?: string | null
          id?: string
          issue_unit_snapshot?: string
          machine_id?: string | null
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          normalized_quantity?: number
          normalized_unit?: string
          occurred_at?: string
          package_description_snapshot?: string | null
          product_id?: string
          recorded_by?: string
          source_visit_id?: string | null
          stop_id?: string | null
          to_location_id?: string | null
          units_per_issue_unit_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          allows_loose_units: boolean
          allows_partial_base_unit: boolean
          base_unit: string
          category: Database["public"]["Enums"]["inventory_product_category"]
          created_at: string
          id: string
          is_active: boolean
          issue_unit: string
          name: string
          package_description: string | null
          sku: string | null
          sort_order: number
          unit_label: string
          units_per_issue_unit: number
          updated_at: string
        }
        Insert: {
          allows_loose_units?: boolean
          allows_partial_base_unit?: boolean
          base_unit: string
          category: Database["public"]["Enums"]["inventory_product_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          issue_unit: string
          name: string
          package_description?: string | null
          sku?: string | null
          sort_order?: number
          unit_label: string
          units_per_issue_unit: number
          updated_at?: string
        }
        Update: {
          allows_loose_units?: boolean
          allows_partial_base_unit?: boolean
          base_unit?: string
          category?: Database["public"]["Enums"]["inventory_product_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          issue_unit?: string
          name?: string
          package_description?: string | null
          sku?: string | null
          sort_order?: number
          unit_label?: string
          units_per_issue_unit?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_restock_drop_items: {
        Row: {
          actual_quantity: number
          counted_quantity: number
          created_at: string
          id: string
          movement_from: string
          movement_to: string
          par_level: number
          product_id: string
          recommended_quantity: number
          restock_drop_id: string
          updated_at: string
        }
        Insert: {
          actual_quantity: number
          counted_quantity: number
          created_at?: string
          id?: string
          movement_from?: string
          movement_to?: string
          par_level: number
          product_id: string
          recommended_quantity: number
          restock_drop_id: string
          updated_at?: string
        }
        Update: {
          actual_quantity?: number
          counted_quantity?: number
          created_at?: string
          id?: string
          movement_from?: string
          movement_to?: string
          par_level?: number
          product_id?: string
          recommended_quantity?: number
          restock_drop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restock_drop_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_restock_drop_items_restock_drop_id_fkey"
            columns: ["restock_drop_id"]
            isOneToOne: false
            referencedRelation: "inventory_restock_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_restock_drops: {
        Row: {
          audit_id: string
          client_id: string
          confirmed_at: string
          created_at: string
          id: string
          machine_id: string
          source_driver_id: string
          source_visit_id: string
          stop_id: string
          updated_at: string
        }
        Insert: {
          audit_id: string
          client_id: string
          confirmed_at: string
          created_at?: string
          id?: string
          machine_id: string
          source_driver_id: string
          source_visit_id: string
          stop_id: string
          updated_at?: string
        }
        Update: {
          audit_id?: string
          client_id?: string
          confirmed_at?: string
          created_at?: string
          id?: string
          machine_id?: string
          source_driver_id?: string
          source_visit_id?: string
          stop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restock_drops_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "inventory_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_restock_drops_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_restock_drops_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_restock_drops_source_driver_id_fkey"
            columns: ["source_driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_restock_drops_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pings: {
        Row: {
          accuracy_meters: number | null
          created_at: string
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          route_id: string | null
          speed_meters_per_second: number | null
        }
        Insert: {
          accuracy_meters?: number | null
          created_at?: string
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          route_id?: string | null
          speed_meters_per_second?: number | null
        }
        Update: {
          accuracy_meters?: number | null
          created_at?: string
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          route_id?: string | null
          speed_meters_per_second?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_meter_readings: {
        Row: {
          archive_total: number | null
          created_at: string
          delta: number | null
          id: string
          machine_id: string
          notes: string | null
          previous_reading: number | null
          reading: number
          recorded_at: string
          recorded_by: string | null
          service_stop_id: string | null
          source_visit_id: string
        }
        Insert: {
          archive_total?: number | null
          created_at?: string
          delta?: number | null
          id?: string
          machine_id: string
          notes?: string | null
          previous_reading?: number | null
          reading: number
          recorded_at?: string
          recorded_by?: string | null
          service_stop_id?: string | null
          source_visit_id: string
        }
        Update: {
          archive_total?: number | null
          created_at?: string
          delta?: number | null
          id?: string
          machine_id?: string
          notes?: string | null
          previous_reading?: number | null
          reading?: number
          recorded_at?: string
          recorded_by?: string | null
          service_stop_id?: string | null
          source_visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_meter_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_meter_readings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_meter_readings_service_stop_id_fkey"
            columns: ["service_stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
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
      service_visit_photos: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["service_photo_kind"]
          machine_id: string
          source_visit_id: string
          stage: Database["public"]["Enums"]["service_photo_stage"]
          stop_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          captured_at: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["service_photo_kind"]
          machine_id: string
          source_visit_id: string
          stage: Database["public"]["Enums"]["service_photo_stage"]
          stop_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["service_photo_kind"]
          machine_id?: string
          source_visit_id?: string
          stage?: Database["public"]["Enums"]["service_photo_stage"]
          stop_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visit_photos_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_photos_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visit_signatures: {
        Row: {
          client_id: string
          created_at: string
          id: string
          machine_id: string
          signed_at: string
          signed_by: string
          source_visit_id: string
          stop_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          machine_id: string
          signed_at: string
          signed_by: string
          source_visit_id: string
          stop_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          signed_at?: string
          signed_by?: string
          source_visit_id?: string
          stop_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visit_signatures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_signatures_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_signatures_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_signatures_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visit_summaries: {
        Row: {
          client_id: string
          closing_scanned_value: string | null
          closing_verified_at: string | null
          completed_at: string
          completed_by: string
          created_at: string
          email_sent_at: string | null
          id: string
          machine_id: string
          notification_error: string | null
          notification_status: string
          source_visit_id: string
          stop_id: string
          summary: Json
          survey_token: string
          updated_at: string
        }
        Insert: {
          client_id: string
          closing_scanned_value?: string | null
          closing_verified_at?: string | null
          completed_at: string
          completed_by: string
          created_at?: string
          email_sent_at?: string | null
          id?: string
          machine_id: string
          notification_error?: string | null
          notification_status?: string
          source_visit_id: string
          stop_id: string
          summary?: Json
          survey_token?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          closing_scanned_value?: string | null
          closing_verified_at?: string | null
          completed_at?: string
          completed_by?: string
          created_at?: string
          email_sent_at?: string | null
          id?: string
          machine_id?: string
          notification_error?: string | null
          notification_status?: string
          source_visit_id?: string
          stop_id?: string
          summary?: Json
          survey_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visit_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_summaries_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_summaries_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_summaries_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visit_surveys: {
        Row: {
          id: string
          rating: number
          submitted_at: string
          summary_id: string
        }
        Insert: {
          id?: string
          rating: number
          submitted_at?: string
          summary_id: string
        }
        Update: {
          id?: string
          rating?: number
          submitted_at?: string
          summary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visit_surveys_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: true
            referencedRelation: "service_visit_summaries"
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
          drink_count_required: boolean
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
          drink_count_required?: boolean
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
          drink_count_required?: boolean
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
      technical_tickets: {
        Row: {
          assigned_to: string | null
          client_id: string
          created_at: string
          description: string
          id: string
          machine_id: string
          photo_storage_path: string | null
          reported_by: string
          resolved_at: string | null
          source_visit_id: string
          status: Database["public"]["Enums"]["technical_ticket_status"]
          stop_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          created_at?: string
          description: string
          id?: string
          machine_id: string
          photo_storage_path?: string | null
          reported_by: string
          resolved_at?: string | null
          source_visit_id: string
          status?: Database["public"]["Enums"]["technical_ticket_status"]
          stop_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          machine_id?: string
          photo_storage_path?: string | null
          reported_by?: string
          resolved_at?: string | null
          source_visit_id?: string
          status?: Database["public"]["Enums"]["technical_ticket_status"]
          stop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_tickets_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_tickets_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_tickets_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          auto_close_reason: string | null
          auto_closed_at: string | null
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
          route_id: string | null
          selfie_status: Database["public"]["Enums"]["selfie_verification_status"]
          shift_end_at: string | null
          status: Database["public"]["Enums"]["time_entry_status"]
          stop_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          auto_close_reason?: string | null
          auto_closed_at?: string | null
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
          route_id?: string | null
          selfie_status?: Database["public"]["Enums"]["selfie_verification_status"]
          shift_end_at?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          stop_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          auto_close_reason?: string | null
          auto_closed_at?: string | null
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
          route_id?: string | null
          selfie_status?: Database["public"]["Enums"]["selfie_verification_status"]
          shift_end_at?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          stop_id?: string | null
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
            foreignKeyName: "time_entries_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
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
      active_fleet_locations: {
        Row: {
          accuracy_meters: number | null
          created_at: string | null
          driver_email: string | null
          driver_full_name: string | null
          driver_id: string | null
          driver_region: string | null
          heading: number | null
          id: string | null
          latitude: number | null
          longitude: number | null
          recorded_at: string | null
          route_date: string | null
          route_id: string | null
          route_status: Database["public"]["Enums"]["route_status"] | null
          speed_meters_per_second: number | null
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_client_reserve_decrease: {
        Args: {
          p_current_reserve_before: number
          p_previous_reserve_after: number
        }
        Returns: number
      }
      client_is_in_current_user_region: {
        Args: { target_client_id: string }
        Returns: boolean
      }
      current_user_has_client_stop: {
        Args: { target_client_id: string }
        Returns: boolean
      }
      current_user_has_machine_stop: {
        Args: { target_machine_id: string }
        Returns: boolean
      }
      current_user_has_route: {
        Args: { target_route_id: string }
        Returns: boolean
      }
      current_user_has_route_for_warehouse: {
        Args: { target_warehouse_id: string }
        Returns: boolean
      }
      current_user_region: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      driver_has_route_at_warehouse: {
        Args: { target_warehouse_id: string }
        Returns: boolean
      }
      get_inventory_location_id: {
        Args: {
          p_entity_id: string
          p_location_type: Database["public"]["Enums"]["inventory_location_type"]
        }
        Returns: string
      }
      get_previous_client_reserve_balance: {
        Args: { p_before: string; p_client_id: string; p_product_id: string }
        Returns: number
      }
      is_ceo: { Args: never; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      is_field_staff: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      save_client_reserve_before_service: {
        Args: {
          p_client_id: string
          p_items: Json
          p_machine_id: string
          p_recorded_at: string
          p_source_visit_id: string
          p_stop_id: string
        }
        Returns: string
      }
      save_inventory_audit: {
        Args: {
          p_client_id: string
          p_counted_at: string
          p_items: Json
          p_machine_id: string
          p_source_visit_id: string
          p_stop_id: string
        }
        Returns: string
      }
      save_inventory_restock_drop: {
        Args: {
          p_audit_id: string
          p_client_id: string
          p_confirmed_at: string
          p_items: Json
          p_machine_id: string
          p_source_visit_id: string
          p_stop_id: string
        }
        Returns: string
      }
      warehouse_is_in_current_user_region: {
        Args: { target_warehouse_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "driver" | "tech" | "manager" | "ceo"
      client_reserve_snapshot_stage: "before_service" | "after_service"
      inventory_location_type:
        | "warehouse"
        | "driver"
        | "client_reserve"
        | "machine"
      inventory_movement_type:
        | "warehouse_issue"
        | "client_delivery"
        | "machine_refill"
        | "warehouse_return"
        | "adjustment"
      inventory_product_category:
        | "coffee"
        | "powders"
        | "sweeteners_stirrers"
        | "cups_lids"
        | "creamers"
        | "cleaning"
      machine_status: "active" | "inactive" | "maintenance" | "retired"
      route_status:
        | "draft"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      selfie_verification_status: "required" | "uploaded" | "missing" | "waived"
      service_photo_kind: "exterior" | "interior_hopper" | "completed_machine"
      service_photo_stage: "before" | "after" | "signature"
      stop_status: "pending" | "in_progress" | "completed" | "skipped"
      technical_ticket_status: "open" | "in_progress" | "resolved" | "cancelled"
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
      client_reserve_snapshot_stage: ["before_service", "after_service"],
      inventory_location_type: [
        "warehouse",
        "driver",
        "client_reserve",
        "machine",
      ],
      inventory_movement_type: [
        "warehouse_issue",
        "client_delivery",
        "machine_refill",
        "warehouse_return",
        "adjustment",
      ],
      inventory_product_category: [
        "coffee",
        "powders",
        "sweeteners_stirrers",
        "cups_lids",
        "creamers",
        "cleaning",
      ],
      machine_status: ["active", "inactive", "maintenance", "retired"],
      route_status: [
        "draft",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      selfie_verification_status: ["required", "uploaded", "missing", "waived"],
      service_photo_kind: ["exterior", "interior_hopper", "completed_machine"],
      service_photo_stage: ["before", "after", "signature"],
      stop_status: ["pending", "in_progress", "completed", "skipped"],
      technical_ticket_status: ["open", "in_progress", "resolved", "cancelled"],
      time_entry_review_status: ["pending", "approved", "flagged", "rejected"],
      time_entry_status: ["open", "closed", "flagged", "manager_override"],
    },
  },
} as const
