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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          avatar_url: string | null
          company: string | null
          company_name: string | null
          country: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          payment_terms: string | null
          payment_terms_days: number | null
          profile_image_url: string | null
          status: string | null
          tax_id: string | null
          updated_at: string
          whatsapp: string | null
          whatsapp_phone: string | null
          workspace_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          company?: string | null
          company_name?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          payment_terms?: string | null
          payment_terms_days?: number | null
          profile_image_url?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_phone?: string | null
          workspace_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          company?: string | null
          company_name?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          payment_terms?: string | null
          payment_terms_days?: number | null
          profile_image_url?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_phone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          subject: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_amounts: {
        Row: {
          discount_total: number | null
          invoice_id: string
          manual_tax_rate: number | null
          shipping: number | null
        }
        Insert: {
          discount_total?: number | null
          invoice_id: string
          manual_tax_rate?: number | null
          shipping?: number | null
        }
        Update: {
          discount_total?: number | null
          invoice_id?: string
          manual_tax_rate?: number | null
          shipping?: number | null
        }
        Relationships: []
      }
      invoice_delivery_logs: {
        Row: {
          body_preview: string | null
          created_at: string
          error_message: string | null
          id: string
          invoice_id: string
          provider_message_id: string | null
          recipient_email: string
          status: string
          subject: string
          workspace_id: string
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id: string
          provider_message_id?: string | null
          recipient_email: string
          status: string
          subject: string
          workspace_id: string
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string
          provider_message_id?: string | null
          recipient_email?: string
          status?: string
          subject?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_delivery_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_risk_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          line_total: number | null
          name: string
          organization_id: string
          position: number | null
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          line_total?: number | null
          name: string
          organization_id: string
          position?: number | null
          quantity?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          line_total?: number | null
          name?: string
          organization_id?: string
          position?: number | null
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_risk_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          discount_amount: number | null
          discount_percent: number | null
          due_date: string | null
          id: string
          invoice_number: string
          is_overdue: boolean | null
          issue_date: string
          notes: string | null
          organization_id: string
          outstanding_amount: number | null
          paid_date: string | null
          payment_link: string | null
          payment_state: string | null
          payment_terms: string | null
          payment_terms_days: number | null
          pdf_url: string | null
          po_number: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tax_percent: number | null
          total_paid: number | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          currency: string
          discount_amount?: number | null
          discount_percent?: number | null
          due_date?: string | null
          id?: string
          invoice_number: string
          is_overdue?: boolean | null
          issue_date: string
          notes?: string | null
          organization_id: string
          outstanding_amount?: number | null
          paid_date?: string | null
          payment_link?: string | null
          payment_state?: string | null
          payment_terms?: string | null
          payment_terms_days?: number | null
          pdf_url?: string | null
          po_number?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_percent?: number | null
          total_paid?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          discount_amount?: number | null
          discount_percent?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          is_overdue?: boolean | null
          issue_date?: string
          notes?: string | null
          organization_id?: string
          outstanding_amount?: number | null
          paid_date?: string | null
          payment_link?: string | null
          payment_state?: string | null
          payment_terms?: string | null
          payment_terms_days?: number | null
          pdf_url?: string | null
          po_number?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_percent?: number | null
          total_paid?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          is_default: boolean
          locale: string | null
          name: string
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          id?: string
          is_default?: boolean
          locale?: string | null
          name: string
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_default?: boolean
          locale?: string | null
          name?: string
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          default_currency: string
          id: string
          invoice_number_prefix: string | null
          invoice_number_start: number | null
          logo_url: string | null
          monthly_invoice_limit: number | null
          name: string
          reminder_days_after_due_1: number | null
          reminder_days_after_due_2: number | null
          reminder_days_before_due: number | null
          reminders_enabled: boolean | null
          settings: Json
          slug: string | null
          subscription_status: string | null
          subscription_tier: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
          user_limit: number | null
        }
        Insert: {
          created_at?: string
          default_currency?: string
          id?: string
          invoice_number_prefix?: string | null
          invoice_number_start?: number | null
          logo_url?: string | null
          monthly_invoice_limit?: number | null
          name: string
          reminder_days_after_due_1?: number | null
          reminder_days_after_due_2?: number | null
          reminder_days_before_due?: number | null
          reminders_enabled?: boolean | null
          settings?: Json
          slug?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_limit?: number | null
        }
        Update: {
          created_at?: string
          default_currency?: string
          id?: string
          invoice_number_prefix?: string | null
          invoice_number_start?: number | null
          logo_url?: string | null
          monthly_invoice_limit?: number | null
          name?: string
          reminder_days_after_due_1?: number | null
          reminder_days_after_due_2?: number | null
          reminder_days_before_due?: number | null
          reminders_enabled?: boolean | null
          settings?: Json
          slug?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_limit?: number | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          invoice_id: string
          method: string | null
          net_amount: number | null
          notes: string | null
          organization_id: string
          payment_date: string
          payment_provider: string | null
          proof_url: string | null
          status: string
          transaction_fee: number
          transaction_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency: string
          id?: string
          invoice_id: string
          method?: string | null
          net_amount?: number | null
          notes?: string | null
          organization_id: string
          payment_date: string
          payment_provider?: string | null
          proof_url?: string | null
          status?: string
          transaction_fee?: number
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          method?: string | null
          net_amount?: number | null
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_provider?: string | null
          proof_url?: string | null
          status?: string
          transaction_fee?: number
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_risk_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reminder_rule_steps: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          offset_days: number
          rule_id: string
          step: number
          template_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled?: boolean
          id?: string
          offset_days: number
          rule_id: string
          step: number
          template_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          offset_days?: number
          rule_id?: string
          step?: number
          template_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rule_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_rules: {
        Row: {
          created_at: string | null
          for_status: string
          id: string
          is_enabled: boolean | null
          name: string
          offset_days: number
          sort_order: number | null
          template_id: string
          trigger_type: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          for_status?: string
          id?: string
          is_enabled?: boolean | null
          name?: string
          offset_days?: number
          sort_order?: number | null
          template_id: string
          trigger_type?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          for_status?: string
          id?: string
          is_enabled?: boolean | null
          name?: string
          offset_days?: number
          sort_order?: number | null
          template_id?: string
          trigger_type?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reminder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_templates: {
        Row: {
          body: string
          channel: string
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean
          is_enabled: boolean | null
          name: string
          sort_order: number | null
          subject: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          channel?: string
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean | null
          name: string
          sort_order?: number | null
          subject: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          channel?: string
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean | null
          name?: string
          sort_order?: number | null
          subject?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          attempts: number
          body: string | null
          channel: string
          client_id: string | null
          client_response: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          invoice_id: string
          last_error: string | null
          organization_id: string
          rule_id: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
          template_used: string | null
          type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          body?: string | null
          channel: string
          client_id?: string | null
          client_response?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          invoice_id: string
          last_error?: string | null
          organization_id: string
          rule_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          template_used?: string | null
          type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string | null
          channel?: string
          client_id?: string | null
          client_response?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string
          last_error?: string | null
          organization_id?: string
          rule_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          template_used?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_risk_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          auto_send_reminders: boolean
          auto_thank_you: boolean
          business_address_line1: string | null
          business_address_line2: string | null
          business_city: string | null
          business_country: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          business_postal_code: string | null
          business_state: string | null
          business_tax_number: string | null
          business_website: string | null
          created_at: string
          date_format: string
          default_currency: string
          default_due_days: number
          email_provider: string
          from_email: string | null
          from_name: string | null
          invoice_prefix: string
          language: string
          logo_url: string | null
          provider_api_key: string | null
          reminder_after_days: number
          reminder_before_days: number
          reminder_channel: string
          tax_rate: number | null
          timezone: string
          updated_at: string
          whatsapp_number: string | null
          workspace_display_name: string | null
          workspace_id: string
          workspace_logo_url: string | null
        }
        Insert: {
          auto_send_reminders?: boolean
          auto_thank_you?: boolean
          business_address_line1?: string | null
          business_address_line2?: string | null
          business_city?: string | null
          business_country?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_postal_code?: string | null
          business_state?: string | null
          business_tax_number?: string | null
          business_website?: string | null
          created_at?: string
          date_format?: string
          default_currency?: string
          default_due_days?: number
          email_provider?: string
          from_email?: string | null
          from_name?: string | null
          invoice_prefix?: string
          language?: string
          logo_url?: string | null
          provider_api_key?: string | null
          reminder_after_days?: number
          reminder_before_days?: number
          reminder_channel?: string
          tax_rate?: number | null
          timezone?: string
          updated_at?: string
          whatsapp_number?: string | null
          workspace_display_name?: string | null
          workspace_id: string
          workspace_logo_url?: string | null
        }
        Update: {
          auto_send_reminders?: boolean
          auto_thank_you?: boolean
          business_address_line1?: string | null
          business_address_line2?: string | null
          business_city?: string | null
          business_country?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_postal_code?: string | null
          business_state?: string | null
          business_tax_number?: string | null
          business_website?: string | null
          created_at?: string
          date_format?: string
          default_currency?: string
          default_due_days?: number
          email_provider?: string
          from_email?: string | null
          from_name?: string | null
          invoice_prefix?: string
          language?: string
          logo_url?: string | null
          provider_api_key?: string | null
          reminder_after_days?: number
          reminder_before_days?: number
          reminder_channel?: string
          tax_rate?: number | null
          timezone?: string
          updated_at?: string
          whatsapp_number?: string | null
          workspace_display_name?: string | null
          workspace_id?: string
          workspace_logo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string
          profile_image_url: string | null
          role: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          profile_image_url?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          profile_image_url?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_email_settings: {
        Row: {
          created_at: string | null
          from_email: string | null
          from_name: string | null
          id: string
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_username: string | null
          updated_at: string | null
          use_tls: boolean | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string | null
          use_tls?: boolean | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string | null
          use_tls?: boolean | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_email_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_plans: {
        Row: {
          client_limit: number | null
          created_at: string
          invoice_limit_monthly: number | null
          plan: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_limit?: number | null
          created_at?: string
          invoice_limit_monthly?: number | null
          plan?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_limit?: number | null
          created_at?: string
          invoice_limit_monthly?: number | null
          plan?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_reminder_settings: {
        Row: {
          auto_reminders_enabled: boolean
          created_at: string
          default_after_due_days: number
          default_before_due_days: number
          default_channel: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_reminders_enabled?: boolean
          created_at?: string
          default_after_due_days?: number
          default_before_due_days?: number
          default_channel?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_reminders_enabled?: boolean
          created_at?: string
          default_after_due_days?: number
          default_before_due_days?: number
          default_channel?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_reminder_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          profile_image_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          profile_image_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          profile_image_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      client_ar_summary: {
        Row: {
          client_id: string | null
          email: string | null
          invoice_count: number | null
          name: string | null
          organization_id: string | null
          status: string | null
          total_invoiced: number | null
          total_outstanding: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_risk_view: {
        Row: {
          client_id: string | null
          client_name: string | null
          currency: string | null
          display_status: string | null
          invoice_id: string | null
          invoice_number: string | null
          is_overdue: boolean | null
          outstanding: number | null
          overdue_days: number | null
          paid: number | null
          risk_level: string | null
          total: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_view: {
        Row: {
          base_status: string | null
          client_id: string | null
          client_name: string | null
          currency: string | null
          display_status: string | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          is_overdue: boolean | null
          issue_date: string | null
          notes: string | null
          outstanding: number | null
          overdue_days: number | null
          paid: number | null
          paid_amount: number | null
          po_number: string | null
          risk_level: string | null
          total: number | null
          total_amount: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_with_metrics: {
        Row: {
          aging_bucket: string | null
          amount: number | null
          amount_outstanding: number | null
          amount_paid: number | null
          client_id: string | null
          created_at: string | null
          currency: string | null
          days_since_due: number | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          organization_id: string | null
          paid_date: string | null
          payment_link: string | null
          pdf_url: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_with_status: {
        Row: {
          aging_bucket: string | null
          amount: number | null
          amount_outstanding: number | null
          amount_paid: number | null
          client_id: string | null
          created_at: string | null
          currency: string | null
          days_since_due: number | null
          derived_status: string | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          organization_id: string | null
          original_status: string | null
          paid_date: string | null
          payment_link: string | null
          pdf_url: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_ar_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_view: {
        Row: {
          amount: number | null
          client_name: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          invoice_id: string | null
          invoice_number: string | null
          is_failed: boolean | null
          method: string | null
          notes: string | null
          paid_at: string | null
          payment_date: string | null
          payment_provider: string | null
          status: string | null
          transaction_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_risk_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
