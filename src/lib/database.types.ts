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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      assinaturas: {
        Row: {
          atualizado_em: string
          cancel_at: string | null
          ciclos_pagos: number
          criado_em: string
          cupom_id: string | null
          id: string
          inscricao_id: string
          status_stripe: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string
          stripe_subscription_id: string
          trial_end: string | null
        }
        Insert: {
          atualizado_em?: string
          cancel_at?: string | null
          ciclos_pagos?: number
          criado_em?: string
          cupom_id?: string | null
          id?: string
          inscricao_id: string
          status_stripe: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id: string
          stripe_subscription_id: string
          trial_end?: string | null
        }
        Update: {
          atualizado_em?: string
          cancel_at?: string | null
          ciclos_pagos?: number
          criado_em?: string
          cupom_id?: string | null
          id?: string
          inscricao_id?: string
          status_stripe?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string
          stripe_subscription_id?: string
          trial_end?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: true
            referencedRelation: "inscricoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cupons: {
        Row: {
          ativo: boolean
          codigo: string
          criado_em: string
          expira_em: string | null
          id: string
          safra_id: string | null
          stripe_coupon_id: string | null
          tipo: string
          usos_atuais: number
          usos_max: number | null
          valor: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          criado_em?: string
          expira_em?: string | null
          id?: string
          safra_id?: string | null
          stripe_coupon_id?: string | null
          tipo: string
          usos_atuais?: number
          usos_max?: number | null
          valor: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          criado_em?: string
          expira_em?: string | null
          id?: string
          safra_id?: string | null
          stripe_coupon_id?: string | null
          tipo?: string
          usos_atuais?: number
          usos_max?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cupons_safra_id_fkey"
            columns: ["safra_id"]
            isOneToOne: false
            referencedRelation: "safras"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_stripe: {
        Row: {
          payload: Json
          recebido_em: string
          stripe_event_id: string
          tipo: string
        }
        Insert: {
          payload: Json
          recebido_em?: string
          stripe_event_id: string
          tipo: string
        }
        Update: {
          payload?: Json
          recebido_em?: string
          stripe_event_id?: string
          tipo?: string
        }
        Relationships: []
      }
      grupos: {
        Row: {
          ativo: boolean
          capacidade: number | null
          created_at: string
          dia_semana: string
          horario: string
          id: string
          safra_id: string
        }
        Insert: {
          ativo?: boolean
          capacidade?: number | null
          created_at?: string
          dia_semana: string
          horario: string
          id?: string
          safra_id: string
        }
        Update: {
          ativo?: boolean
          capacidade?: number | null
          created_at?: string
          dia_semana?: string
          horario?: string
          id?: string
          safra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_safra_id_fkey"
            columns: ["safra_id"]
            isOneToOne: false
            referencedRelation: "safras"
            referencedColumns: ["id"]
          },
        ]
      }
      inscricoes: {
        Row: {
          consent: boolean | null
          consent_at: string | null
          consent_text: string | null
          created_at: string
          curso: string | null
          data_primeira_cobranca_travada: string | null
          disponibilidade: string[] | null
          duracao_meses_travada: number | null
          grupo_id: string | null
          id: string
          nivel_ingles: string | null
          periodo: string | null
          pessoa_id: string
          safra_id: string | null
          status: string
          valor_mensal_travado: number | null
        }
        Insert: {
          consent?: boolean | null
          consent_at?: string | null
          consent_text?: string | null
          created_at?: string
          curso?: string | null
          data_primeira_cobranca_travada?: string | null
          disponibilidade?: string[] | null
          duracao_meses_travada?: number | null
          grupo_id?: string | null
          id?: string
          nivel_ingles?: string | null
          periodo?: string | null
          pessoa_id: string
          safra_id?: string | null
          status: string
          valor_mensal_travado?: number | null
        }
        Update: {
          consent?: boolean | null
          consent_at?: string | null
          consent_text?: string | null
          created_at?: string
          curso?: string | null
          data_primeira_cobranca_travada?: string | null
          disponibilidade?: string[] | null
          duracao_meses_travada?: number | null
          grupo_id?: string | null
          id?: string
          nivel_ingles?: string | null
          periodo?: string | null
          pessoa_id?: string
          safra_id?: string | null
          status?: string
          valor_mensal_travado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inscricoes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscricoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscricoes_safra_id_fkey"
            columns: ["safra_id"]
            isOneToOne: false
            referencedRelation: "safras"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          telefone: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome: string
          telefone: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          telefone?: string
        }
        Relationships: []
      }
      safras: {
        Row: {
          created_at: string
          data_inicio_aulas: string
          data_primeira_cobranca: string
          duracao_meses: number
          id: string
          inscricoes_abertas: boolean
          nome: string
          slug: string
          stripe_price_id: string | null
          vagas_total: number | null
          valor_mensal: number
        }
        Insert: {
          created_at?: string
          data_inicio_aulas: string
          data_primeira_cobranca: string
          duracao_meses: number
          id?: string
          inscricoes_abertas?: boolean
          nome: string
          slug: string
          stripe_price_id?: string | null
          vagas_total?: number | null
          valor_mensal: number
        }
        Update: {
          created_at?: string
          data_inicio_aulas?: string
          data_primeira_cobranca?: string
          duracao_meses?: number
          id?: string
          inscricoes_abertas?: boolean
          nome?: string
          slug?: string
          stripe_price_id?: string | null
          vagas_total?: number | null
          valor_mensal?: number
        }
        Relationships: []
      }
      waitlist_legado: {
        Row: {
          consent: boolean | null
          consent_at: string | null
          consent_text: string | null
          created_at: string
          curso: string | null
          disponibilidade: string[] | null
          email: string
          grupo: string | null
          id: string
          name: string
          nivel_ingles: string | null
          payment_choice: string
          periodo: string | null
          phone: string | null
          status: string
          turma_id: string | null
        }
        Insert: {
          consent?: boolean | null
          consent_at?: string | null
          consent_text?: string | null
          created_at?: string
          curso?: string | null
          disponibilidade?: string[] | null
          email: string
          grupo?: string | null
          id?: string
          name: string
          nivel_ingles?: string | null
          payment_choice?: string
          periodo?: string | null
          phone?: string | null
          status?: string
          turma_id?: string | null
        }
        Update: {
          consent?: boolean | null
          consent_at?: string | null
          consent_text?: string | null
          created_at?: string
          curso?: string | null
          disponibilidade?: string[] | null
          email?: string
          grupo?: string | null
          id?: string
          name?: string
          nivel_ingles?: string | null
          payment_choice?: string
          periodo?: string | null
          phone?: string | null
          status?: string
          turma_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "safras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      criar_inscricao: {
        Args: {
          p_consent_at: string
          p_consent_text: string
          p_curso: string
          p_disponibilidade: string[]
          p_email: string
          p_nivel_ingles: string
          p_nome: string
          p_periodo: string
          p_safra_id?: string
          p_telefone: string
        }
        Returns: boolean
      }
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
