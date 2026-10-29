export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          balance_paise: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          balance_paise?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          balance_paise?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          provider: "openai" | "gemini" | "anthropic" | "openrouter";
          encrypted_key: string;
          iv: string;
          auth_tag: string;
          label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: "openai" | "gemini" | "anthropic" | "openrouter";
          encrypted_key: string;
          iv: string;
          auth_tag: string;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "openai" | "gemini" | "anthropic" | "openrouter";
          encrypted_key?: string;
          iv?: string;
          auth_tag?: string;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          user_id: string;
          project: string;
          provider: string;
          model: string;
          sandbox_seconds: number;
          input_tokens: number;
          output_tokens: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project: string;
          provider: string;
          model: string;
          sandbox_seconds?: number;
          input_tokens?: number;
          output_tokens?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          sandbox_seconds?: number;
          input_tokens?: number;
          output_tokens?: number;
          status?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: "topup" | "ai_usage" | "bonus";
          amount_paise: number;
          balance_after_paise: number;
          description: string | null;
          metadata: Json | null;
          razorpay_payment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "topup" | "ai_usage" | "bonus";
          amount_paise: number;
          balance_after_paise: number;
          description?: string | null;
          metadata?: Json | null;
          razorpay_payment_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "topup" | "ai_usage" | "bonus";
          amount_paise?: number;
          balance_after_paise?: number;
          description?: string | null;
          metadata?: Json | null;
          razorpay_payment_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      rate_config: {
        Row: {
          id: string;
          provider: string;
          model: string;
          input_paise_per_1k_tokens: number;
          output_paise_per_1k_tokens: number;
          is_active: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          model: string;
          input_paise_per_1k_tokens: number;
          output_paise_per_1k_tokens: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          model?: string;
          input_paise_per_1k_tokens?: number;
          output_paise_per_1k_tokens?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      circuit_breaker_log: {
        Row: {
          id: string;
          user_id: string;
          requested_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          requested_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          requested_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          user_id: string;
          name: string;
          files: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          files: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          name?: string;
          files?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
