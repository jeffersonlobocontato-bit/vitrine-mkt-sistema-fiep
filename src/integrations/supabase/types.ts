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
      agent_presets: {
        Row: {
          campanha_id: string | null
          carousel_slides: number
          casa_id: string | null
          created_at: string
          created_by: string | null
          formats: string[]
          id: string
          image_budget: number
          image_model: string
          instructions: string
          is_default: boolean
          name: string
          provider: string
          template_locked: boolean
          template_spec: Json
          text_model: string
          updated_at: string
        }
        Insert: {
          campanha_id?: string | null
          carousel_slides?: number
          casa_id?: string | null
          created_at?: string
          created_by?: string | null
          formats?: string[]
          id?: string
          image_budget?: number
          image_model?: string
          instructions?: string
          is_default?: boolean
          name: string
          provider?: string
          template_locked?: boolean
          template_spec?: Json
          text_model?: string
          updated_at?: string
        }
        Update: {
          campanha_id?: string | null
          carousel_slides?: number
          casa_id?: string | null
          created_at?: string
          created_by?: string | null
          formats?: string[]
          id?: string
          image_budget?: number
          image_model?: string
          instructions?: string
          is_default?: boolean
          name?: string
          provider?: string
          template_locked?: boolean
          template_spec?: Json
          text_model?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_presets_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_presets_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          cost_brl: number
          cost_usd: number
          created_at: string
          duration_ms: number
          id: string
          images: number
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          run_id: string | null
          step: string
          success: boolean
        }
        Insert: {
          cost_brl?: number
          cost_usd?: number
          created_at?: string
          duration_ms?: number
          id?: string
          images?: number
          input_tokens?: number
          model: string
          output_tokens?: number
          provider?: string
          run_id?: string | null
          step: string
          success?: boolean
        }
        Update: {
          cost_brl?: number
          cost_usd?: number
          created_at?: string
          duration_ms?: number
          id?: string
          images?: number
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          run_id?: string | null
          step?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "instagram_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_itens: {
        Row: {
          ativo: boolean
          campanha_id: string
          created_at: string
          dados: Json
          id: string
          nome: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          campanha_id: string
          created_at?: string
          dados?: Json
          id?: string
          nome: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          campanha_id?: string
          created_at?: string
          dados?: Json
          id?: string
          nome?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_itens_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_itens_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          ativo: boolean
          casa_id: string
          created_at: string
          escopo: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          casa_id: string
          created_at?: string
          escopo?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          casa_id?: string
          created_at?: string
          escopo?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      casa_members: {
        Row: {
          casa_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          casa_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          casa_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "casa_members_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      casas: {
        Row: {
          cores: Json
          created_at: string
          fontes: Json
          id: string
          nome: string
          slug: string
        }
        Insert: {
          cores?: Json
          created_at?: string
          fontes?: Json
          id?: string
          nome: string
          slug: string
        }
        Update: {
          cores?: Json
          created_at?: string
          fontes?: Json
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      imagens_banco: {
        Row: {
          campanha_id: string | null
          campanha_item_id: string | null
          casa_id: string
          created_at: string
          id: string
          storage_path: string
          tags: string[]
        }
        Insert: {
          campanha_id?: string | null
          campanha_item_id?: string | null
          casa_id: string
          created_at?: string
          id?: string
          storage_path: string
          tags?: string[]
        }
        Update: {
          campanha_id?: string | null
          campanha_item_id?: string | null
          casa_id?: string
          created_at?: string
          id?: string
          storage_path?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "imagens_banco_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagens_banco_campanha_item_id_fkey"
            columns: ["campanha_item_id"]
            isOneToOne: false
            referencedRelation: "campanha_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagens_banco_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_creatives: {
        Row: {
          campanha_item_id: string | null
          caption: string | null
          created_at: string
          final_image_urls: string[]
          format: string
          hashtags: string[]
          id: string
          preset_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          slides: Json
          status: string
          updated_at: string
        }
        Insert: {
          campanha_item_id?: string | null
          caption?: string | null
          created_at?: string
          final_image_urls?: string[]
          format: string
          hashtags?: string[]
          id?: string
          preset_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id: string
          slides?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          campanha_item_id?: string | null
          caption?: string | null
          created_at?: string
          final_image_urls?: string[]
          format?: string
          hashtags?: string[]
          id?: string
          preset_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string
          slides?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_creatives_campanha_item_id_fkey"
            columns: ["campanha_item_id"]
            isOneToOne: false
            referencedRelation: "campanha_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_creatives_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "agent_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_creatives_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "instagram_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_runs: {
        Row: {
          campanha_id: string | null
          campanha_item_id: string | null
          casa_id: string | null
          cost_brl: number
          cost_usd: number
          created_at: string
          error_message: string | null
          id: string
          image_count: number
          preset_id: string | null
          run_date: string
          status: string
          tokens_total: number
          topic_sources: Json
          topic_summary: string | null
          topic_title: string | null
          updated_at: string
        }
        Insert: {
          campanha_id?: string | null
          campanha_item_id?: string | null
          casa_id?: string | null
          cost_brl?: number
          cost_usd?: number
          created_at?: string
          error_message?: string | null
          id?: string
          image_count?: number
          preset_id?: string | null
          run_date?: string
          status?: string
          tokens_total?: number
          topic_sources?: Json
          topic_summary?: string | null
          topic_title?: string | null
          updated_at?: string
        }
        Update: {
          campanha_id?: string | null
          campanha_item_id?: string | null
          casa_id?: string | null
          cost_brl?: number
          cost_usd?: number
          created_at?: string
          error_message?: string | null
          id?: string
          image_count?: number
          preset_id?: string | null
          run_date?: string
          status?: string
          tokens_total?: number
          topic_sources?: Json
          topic_summary?: string | null
          topic_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_runs_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_runs_campanha_item_id_fkey"
            columns: ["campanha_item_id"]
            isOneToOne: false
            referencedRelation: "campanha_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_runs_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_trend_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_fetch_at: string | null
          last_fetch_status: string | null
          name: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_fetch_at?: string | null
          last_fetch_status?: string | null
          name: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_fetch_at?: string | null
          last_fetch_status?: string | null
          name?: string
          url?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          active: boolean
          bytes: number
          campanha_id: string | null
          casa_id: string | null
          char_count: number
          created_at: string
          created_by: string | null
          doc_type: string
          error_message: string | null
          id: string
          mime: string | null
          preset_id: string | null
          raw_text: string | null
          source_type: string
          status: string
          storage_path: string | null
          title: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bytes?: number
          campanha_id?: string | null
          casa_id?: string | null
          char_count?: number
          created_at?: string
          created_by?: string | null
          doc_type?: string
          error_message?: string | null
          id?: string
          mime?: string | null
          preset_id?: string | null
          raw_text?: string | null
          source_type?: string
          status?: string
          storage_path?: string | null
          title: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bytes?: number
          campanha_id?: string | null
          casa_id?: string | null
          char_count?: number
          created_at?: string
          created_by?: string | null
          doc_type?: string
          error_message?: string | null
          id?: string
          mime?: string | null
          preset_id?: string | null
          raw_text?: string | null
          source_type?: string
          status?: string
          storage_path?: string | null
          title?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "agent_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_reference_files: {
        Row: {
          created_at: string
          id: string
          kind: string
          preset_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          preset_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          preset_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "preset_reference_files_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "agent_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      publish_channels: {
        Row: {
          casa_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          provider: string
        }
        Insert: {
          casa_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
        }
        Update: {
          casa_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_channels_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_image_configs: {
        Row: {
          casa_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          provider: string
        }
        Insert: {
          casa_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
        }
        Update: {
          casa_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_image_configs_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativo: boolean
          casa_id: string
          cidade: string
          contatos: Json
          created_at: string
          endereco: string | null
          estado: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          casa_id: string
          cidade: string
          contatos?: Json
          created_at?: string
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          casa_id?: string
          cidade?: string
          contatos?: Json
          created_at?: string
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_units: {
        Row: {
          created_at: string
          id: string
          unidade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          unidade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          unidade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_units_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_casa_role: {
        Args: { _casa_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_casa_member: {
        Args: { _casa_id: string; _user_id: string }
        Returns: boolean
      }
      match_knowledge_chunks:
        | {
            Args: {
              filter_doc_types?: string[]
              filter_preset?: string
              match_count?: number
              query_embedding: string
            }
            Returns: {
              chunk_id: string
              content: string
              doc_type: string
              document_id: string
              similarity: number
              title: string
            }[]
          }
        | {
            Args: {
              filter_campanha?: string
              filter_casa?: string
              filter_doc_types?: string[]
              filter_preset?: string
              filter_unidade?: string
              match_count?: number
              query_embedding: string
            }
            Returns: {
              chunk_id: string
              content: string
              doc_type: string
              document_id: string
              similarity: number
              title: string
            }[]
          }
      user_belongs_to_unidade: {
        Args: { _unidade_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
