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
      ai_cost_logs: {
        Row: {
          created_at: string
          id: string
          input_cost: number
          input_tokens: number
          job_id: string | null
          model_id: string | null
          model_name: string
          output_cost: number
          output_tokens: number
          purpose: Database["public"]["Enums"]["ai_purpose"]
          total_cost: number
          total_tokens: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_cost?: number
          input_tokens?: number
          job_id?: string | null
          model_id?: string | null
          model_name: string
          output_cost?: number
          output_tokens?: number
          purpose: Database["public"]["Enums"]["ai_purpose"]
          total_cost?: number
          total_tokens?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_cost?: number
          input_tokens?: number
          job_id?: string | null
          model_id?: string | null
          model_name?: string
          output_cost?: number
          output_tokens?: number
          purpose?: Database["public"]["Enums"]["ai_purpose"]
          total_cost?: number
          total_tokens?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_cost_logs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_cost_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          created_at: string
          display_name: string
          id: string
          input_price_per_1m: number
          is_default: boolean
          name: string
          output_price_per_1m: number
          provider_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          input_price_per_1m?: number
          is_default?: boolean
          name: string
          output_price_per_1m?: number
          provider_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          input_price_per_1m?: number
          is_default?: boolean
          name?: string
          output_price_per_1m?: number
          provider_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_models_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string | null
          base_url: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          workspace_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          base_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          workspace_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          base_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_providers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_resume_versions: {
        Row: {
          builder_resume_id: string
          content: Json
          created_at: string
          id: string
          note: string | null
          workspace_id: string
        }
        Insert: {
          builder_resume_id: string
          content: Json
          created_at?: string
          id?: string
          note?: string | null
          workspace_id: string
        }
        Update: {
          builder_resume_id?: string
          content?: Json
          created_at?: string
          id?: string
          note?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_resume_versions_builder_resume_id_fkey"
            columns: ["builder_resume_id"]
            isOneToOne: false
            referencedRelation: "builder_resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_resume_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_resumes: {
        Row: {
          content: Json
          created_at: string
          id: string
          job_id: string
          job_match: Json | null
          latex_source: string | null
          pdf_path: string | null
          primary_color: string | null
          score: Json | null
          secondary_color: string | null
          suggestions: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          job_id: string
          job_match?: Json | null
          latex_source?: string | null
          pdf_path?: string | null
          primary_color?: string | null
          score?: Json | null
          secondary_color?: string | null
          suggestions?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          job_id?: string
          job_match?: Json | null
          latex_source?: string | null
          pdf_path?: string | null
          primary_color?: string | null
          score?: Json | null
          secondary_color?: string | null
          suggestions?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_resumes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_resumes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          token_hash: string
          token_prefix: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          token_hash: string
          token_prefix: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          token_hash?: string
          token_prefix?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_artifacts: {
        Row: {
          compile_error: string | null
          created_at: string
          filename: string
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          latex_source: string
          pdf_storage_path: string | null
          workspace_id: string
        }
        Insert: {
          compile_error?: string | null
          created_at?: string
          filename: string
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          latex_source: string
          pdf_storage_path?: string | null
          workspace_id: string
        }
        Update: {
          compile_error?: string | null
          created_at?: string
          filename?: string
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["artifact_kind"]
          latex_source?: string
          pdf_storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          board_id: string
          company: string
          created_at: string
          date_applied: string | null
          description: string
          id: string
          insights: Json | null
          notes: string | null
          resume_score: number | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          board_id: string
          company: string
          created_at?: string
          date_applied?: string | null
          description?: string
          id?: string
          insights?: Json | null
          notes?: string | null
          resume_score?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          url?: string | null
          workspace_id: string
        }
        Update: {
          board_id?: string
          company?: string
          created_at?: string
          date_applied?: string | null
          description?: string
          id?: string
          insights?: Json | null
          notes?: string | null
          resume_score?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_versions: {
        Row: {
          created_at: string
          id: string
          latex_source: string
          note: string | null
          resume_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          latex_source: string
          note?: string | null
          resume_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          latex_source?: string
          note?: string | null
          resume_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          created_at: string
          id: string
          is_base: boolean
          latex_source: string
          name: string
          page_count: number
          primary_color: string
          secondary_color: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_base?: boolean
          latex_source: string
          name?: string
          page_count?: number
          primary_color?: string
          secondary_color?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_base?: boolean
          latex_source?: string
          name?: string
          page_count?: number
          primary_color?: string
          secondary_color?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          monthly_budget_usd: number | null
          name: string
          onboarding_complete: boolean
          onboarding_step: number
          owner_user_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_budget_usd?: number | null
          name: string
          onboarding_complete?: boolean
          onboarding_step?: number
          owner_user_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_budget_usd?: number | null
          name?: string
          onboarding_complete?: boolean
          onboarding_step?: number
          owner_user_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_workspace: { Args: { _ws: string }; Returns: boolean }
    }
    Enums: {
      ai_purpose:
        | "resume_tailoring"
        | "cover_letter"
        | "resume_scoring"
        | "jd_parsing"
        | "ats_check"
        | "custom"
      app_role: "admin" | "user"
      artifact_kind: "tailored_resume" | "cover_letter" | "ai_tool" | "pdf"
      job_status: "wishlist" | "applied" | "interview" | "rejected" | "offer"
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
      ai_purpose: [
        "resume_tailoring",
        "cover_letter",
        "resume_scoring",
        "jd_parsing",
        "ats_check",
        "custom",
      ],
      app_role: ["admin", "user"],
      artifact_kind: ["tailored_resume", "cover_letter", "ai_tool", "pdf"],
      job_status: ["wishlist", "applied", "interview", "rejected", "offer"],
    },
  },
} as const
