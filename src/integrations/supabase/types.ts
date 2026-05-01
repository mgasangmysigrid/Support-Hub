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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bulletin_attachments: {
        Row: {
          bulletin_post_id: string
          created_at: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          sort_order: number
        }
        Insert: {
          bulletin_post_id: string
          created_at?: string
          file_name: string
          file_type?: string
          file_url: string
          id?: string
          sort_order?: number
        }
        Update: {
          bulletin_post_id?: string
          created_at?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_attachments_bulletin_post_id_fkey"
            columns: ["bulletin_post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "bulletin_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_comments: {
        Row: {
          body: string
          bulletin_post_id: string
          created_at: string
          id: string
          mentions_everyone: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          bulletin_post_id: string
          created_at?: string
          id?: string
          mentions_everyone?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          bulletin_post_id?: string
          created_at?: string
          id?: string
          mentions_everyone?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_comments_bulletin_post_id_fkey"
            columns: ["bulletin_post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_mentions: {
        Row: {
          bulletin_post_id: string
          created_at: string
          id: string
          mentioned_user_id: string
        }
        Insert: {
          bulletin_post_id: string
          created_at?: string
          id?: string
          mentioned_user_id: string
        }
        Update: {
          bulletin_post_id?: string
          created_at?: string
          id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_mentions_bulletin_post_id_fkey"
            columns: ["bulletin_post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_posts: {
        Row: {
          audience_label: string | null
          author_user_id: string
          content_body: string
          created_at: string
          external_link: string | null
          external_link_label: string | null
          id: string
          is_pinned: boolean
          mentions_everyone: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_label?: string | null
          author_user_id: string
          content_body: string
          created_at?: string
          external_link?: string | null
          external_link_label?: string | null
          id?: string
          is_pinned?: boolean
          mentions_everyone?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_label?: string | null
          author_user_id?: string
          content_body?: string
          created_at?: string
          external_link?: string | null
          external_link_label?: string | null
          id?: string
          is_pinned?: boolean
          mentions_everyone?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_posts_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_reactions: {
        Row: {
          bulletin_post_id: string
          created_at: string
          id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          bulletin_post_id: string
          created_at?: string
          id?: string
          reaction_type: string
          user_id: string
        }
        Update: {
          bulletin_post_id?: string
          created_at?: string
          id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_reactions_bulletin_post_id_fkey"
            columns: ["bulletin_post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_reads: {
        Row: {
          bulletin_post_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          bulletin_post_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          bulletin_post_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_reads_bulletin_post_id_fkey"
            columns: ["bulletin_post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_document_acknowledgments: {
        Row: {
          acknowledged_at: string
          created_at: string
          document_id: string
          document_version: number
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          created_at?: string
          document_id: string
          document_version: number
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          created_at?: string
          document_id?: string
          document_version?: number
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      department_members: {
        Row: {
          created_at: string | null
          department_id: string
          id: string
          is_assignable: boolean
          is_manager: boolean
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          is_assignable?: boolean
          is_manager?: boolean
          user_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          is_assignable?: boolean
          is_manager?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          display_order: number
          id: string
          max_out_per_day: number
          name: string
        }
        Insert: {
          code: string
          display_order?: number
          id?: string
          max_out_per_day?: number
          name: string
        }
        Update: {
          code?: string
          display_order?: number
          id?: string
          max_out_per_day?: number
          name?: string
        }
        Relationships: []
      }
      dept_sequences: {
        Row: {
          department_id: string
          next_number: number
        }
        Insert: {
          department_id: string
          next_number?: number
        }
        Update: {
          department_id?: string
          next_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dept_sequences_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          document_id: string
          id: string
          job_type: string
          last_error: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          document_id: string
          id?: string
          job_type?: string
          last_error?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          document_id?: string
          id?: string
          job_type?: string
          last_error?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pipeline_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json | null
          document_id: string
          event_type: string
          id: string
          job_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          document_id: string
          event_type: string
          id?: string
          job_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          document_id?: string
          event_type?: string
          id?: string
          job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_pipeline_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signature_fields: {
        Row: {
          completed: boolean
          created_at: string
          document_id: string
          field_type: string
          height: number
          id: string
          page_number: number
          required: boolean
          signer_role: string | null
          signer_user_id: string | null
          signing_order: number | null
          width: number
          x_position: number
          y_position: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          document_id: string
          field_type?: string
          height?: number
          id?: string
          page_number?: number
          required?: boolean
          signer_role?: string | null
          signer_user_id?: string | null
          signing_order?: number | null
          width?: number
          x_position?: number
          y_position?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          document_id?: string
          field_type?: string
          height?: number
          id?: string
          page_number?: number
          required?: boolean
          signer_role?: string | null
          signer_user_id?: string | null
          signing_order?: number | null
          width?: number
          x_position?: number
          y_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_signature_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signature_fields_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          created_at: string
          document_id: string
          field_id: string | null
          id: string
          signature_data: string
          signature_type: string
          signed_at: string
          signer_user_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          field_id?: string | null
          id?: string
          signature_data: string
          signature_type?: string
          signed_at?: string
          signer_user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          field_id?: string | null
          id?: string
          signature_data?: string
          signature_type?: string
          signed_at?: string
          signer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signers: {
        Row: {
          created_at: string
          declined_at: string | null
          document_id: string
          id: string
          signed_at: string | null
          signer_role: string | null
          signer_user_id: string
          signing_order: number | null
          status: string
        }
        Insert: {
          created_at?: string
          declined_at?: string | null
          document_id: string
          id?: string
          signed_at?: string | null
          signer_role?: string | null
          signer_user_id: string
          signing_order?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          declined_at?: string | null
          document_id?: string
          id?: string
          signed_at?: string | null
          signer_role?: string | null
          signer_user_id?: string
          signing_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signers_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          description: string | null
          document_type: string
          due_date: string | null
          file_name: string | null
          file_url: string
          finalization_attempted_at: string | null
          finalization_error: string | null
          finalized_at: string | null
          id: string
          issued_by_user_id: string
          mime_type: string | null
          processing_started_at: string | null
          processing_state: string
          recipient_user_id: string
          requires_signature: boolean
          signature_order_required: boolean
          signed_file_path: string | null
          signed_file_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_type?: string
          due_date?: string | null
          file_name?: string | null
          file_url: string
          finalization_attempted_at?: string | null
          finalization_error?: string | null
          finalized_at?: string | null
          id?: string
          issued_by_user_id: string
          mime_type?: string | null
          processing_started_at?: string | null
          processing_state?: string
          recipient_user_id: string
          requires_signature?: boolean
          signature_order_required?: boolean
          signed_file_path?: string | null
          signed_file_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          document_type?: string
          due_date?: string | null
          file_name?: string | null
          file_url?: string
          finalization_attempted_at?: string | null
          finalization_error?: string | null
          finalized_at?: string | null
          id?: string
          issued_by_user_id?: string
          mime_type?: string | null
          processing_started_at?: string | null
          processing_state?: string
          recipient_user_id?: string
          requires_signature?: boolean
          signature_order_required?: boolean
          signed_file_path?: string | null
          signed_file_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_issued_by_user_id_fkey"
            columns: ["issued_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      endorsement_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          endorsement_id: string
          endorsement_item_id: string | null
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          endorsement_id: string
          endorsement_item_id?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          endorsement_id?: string
          endorsement_item_id?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "endorsement_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endorsement_audit_log_endorsement_id_fkey"
            columns: ["endorsement_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endorsement_audit_log_endorsement_item_id_fkey"
            columns: ["endorsement_item_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      endorsement_item_assignees: {
        Row: {
          created_at: string
          endorsement_item_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endorsement_item_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endorsement_item_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "endorsement_item_assignees_endorsement_item_id_fkey"
            columns: ["endorsement_item_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endorsement_item_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article_feedback: {
        Row: {
          article_id: string
          created_at: string
          id: string
          is_helpful: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          is_helpful: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          is_helpful?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_article_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          affected_module: string | null
          article_type: string
          category: string
          content: string | null
          created_at: string
          created_by: string | null
          helpful_no_count: number
          helpful_yes_count: number
          id: string
          is_featured: boolean
          is_policy: boolean
          status: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          updated_by: string | null
          view_count: number
        }
        Insert: {
          affected_module?: string | null
          article_type?: string
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          helpful_no_count?: number
          helpful_yes_count?: number
          id?: string
          is_featured?: boolean
          is_policy?: boolean
          status?: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Update: {
          affected_module?: string | null
          article_type?: string
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          helpful_no_count?: number
          helpful_yes_count?: number
          id?: string
          is_featured?: boolean
          is_policy?: boolean
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_articles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          day: number
          emoji: string
          id: string
          is_active: boolean
          month: number
          name: string
        }
        Insert: {
          created_at?: string
          day: number
          emoji?: string
          id?: string
          is_active?: boolean
          month: number
          name: string
        }
        Update: {
          created_at?: string
          day?: number
          emoji?: string
          id?: string
          is_active?: boolean
          month?: number
          name?: string
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          acknowledgment_required_from: string | null
          category: string
          content: string | null
          created_at: string
          created_by: string
          document_version: number
          file_name: string | null
          file_path: string | null
          id: string
          is_archived: boolean
          is_policy: boolean
          requires_acknowledgment: boolean
          title: string
          updated_at: string
          updated_by: string | null
          visibility_type: string
        }
        Insert: {
          acknowledgment_required_from?: string | null
          category?: string
          content?: string | null
          created_at?: string
          created_by: string
          document_version?: number
          file_name?: string | null
          file_path?: string | null
          id?: string
          is_archived?: boolean
          is_policy?: boolean
          requires_acknowledgment?: boolean
          title: string
          updated_at?: string
          updated_by?: string | null
          visibility_type?: string
        }
        Update: {
          acknowledgment_required_from?: string | null
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string
          document_version?: number
          file_name?: string | null
          file_path?: string | null
          id?: string
          is_archived?: boolean
          is_policy?: boolean
          requires_acknowledgment?: boolean
          title?: string
          updated_at?: string
          updated_by?: string | null
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_departments: {
        Row: {
          created_at: string | null
          department_id: string
          id: string
          knowledge_base_id: string
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          knowledge_base_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          knowledge_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_departments_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_reads: {
        Row: {
          doc_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          doc_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          doc_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_reads_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_approval_settings: {
        Row: {
          created_at: string
          default_approval_mode: string
          enabled: boolean
          fallback_approver_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_approval_mode?: string
          enabled?: boolean
          fallback_approver_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_approval_mode?: string
          enabled?: boolean
          fallback_approver_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_approval_settings_fallback_approver_id_fkey"
            columns: ["fallback_approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_approver_groups: {
        Row: {
          approval_mode: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          approval_mode?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          approval_mode?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      leave_approver_overrides: {
        Row: {
          approval_mode: string
          created_at: string
          employee_id: string
          id: string
          updated_at: string
        }
        Insert: {
          approval_mode?: string
          created_at?: string
          employee_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          approval_mode?: string
          created_at?: string
          employee_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_approver_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_snapshot: Json | null
          before_snapshot: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          notes: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          notes?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_endorsement_items: {
        Row: {
          backup_notes: string | null
          client_name: string | null
          created_at: string
          due_date: string | null
          endorsed_to_user_id: string | null
          endorsement_id: string
          endorsement_notes: string | null
          frequency: string | null
          id: string
          next_steps: string | null
          priority: Database["public"]["Enums"]["endorsement_priority"]
          reference_links: Json | null
          remarks: string | null
          sort_order: number
          task_details: string
          task_name: string
          task_status: string
          task_type: Database["public"]["Enums"]["endorsement_task_type"]
          task_update_notes: string | null
          updated_at: string
          urgency: string
        }
        Insert: {
          backup_notes?: string | null
          client_name?: string | null
          created_at?: string
          due_date?: string | null
          endorsed_to_user_id?: string | null
          endorsement_id: string
          endorsement_notes?: string | null
          frequency?: string | null
          id?: string
          next_steps?: string | null
          priority?: Database["public"]["Enums"]["endorsement_priority"]
          reference_links?: Json | null
          remarks?: string | null
          sort_order?: number
          task_details: string
          task_name: string
          task_status?: string
          task_type?: Database["public"]["Enums"]["endorsement_task_type"]
          task_update_notes?: string | null
          updated_at?: string
          urgency?: string
        }
        Update: {
          backup_notes?: string | null
          client_name?: string | null
          created_at?: string
          due_date?: string | null
          endorsed_to_user_id?: string | null
          endorsement_id?: string
          endorsement_notes?: string | null
          frequency?: string | null
          id?: string
          next_steps?: string | null
          priority?: Database["public"]["Enums"]["endorsement_priority"]
          reference_links?: Json | null
          remarks?: string | null
          sort_order?: number
          task_details?: string
          task_name?: string
          task_status?: string
          task_type?: Database["public"]["Enums"]["endorsement_task_type"]
          task_update_notes?: string | null
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_endorsement_items_endorsed_to_user_id_fkey"
            columns: ["endorsed_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsement_items_endorsement_id_fkey"
            columns: ["endorsement_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsements"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_endorsement_recipients: {
        Row: {
          acknowledged_at: string | null
          completed_at: string | null
          created_at: string
          endorsement_id: string
          id: string
          last_updated_at: string | null
          notes: string | null
          recipient_user_id: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          completed_at?: string | null
          created_at?: string
          endorsement_id: string
          id?: string
          last_updated_at?: string | null
          notes?: string | null
          recipient_user_id: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          completed_at?: string | null
          created_at?: string
          endorsement_id?: string
          id?: string
          last_updated_at?: string | null
          notes?: string | null
          recipient_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_endorsement_recipients_endorsement_id_fkey"
            columns: ["endorsement_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsement_recipients_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_endorsement_references: {
        Row: {
          created_at: string
          endorsement_id: string
          id: string
          notes: string | null
          tool_name: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          endorsement_id: string
          id?: string
          notes?: string | null
          tool_name: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          endorsement_id?: string
          id?: string
          notes?: string | null
          tool_name?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_endorsement_references_endorsement_id_fkey"
            columns: ["endorsement_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsements"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_endorsement_updates: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          endorsement_id: string
          id: string
          update_type: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          endorsement_id: string
          id?: string
          update_type?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          endorsement_id?: string
          id?: string
          update_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_endorsement_updates_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsement_updates_endorsement_id_fkey"
            columns: ["endorsement_id"]
            isOneToOne: false
            referencedRelation: "leave_endorsements"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_endorsements: {
        Row: {
          archived_at: string | null
          control_number: string | null
          created_at: string
          department_id: string | null
          employee_user_id: string
          id: string
          important_warnings: string | null
          leave_end_date: string
          leave_request_id: string | null
          leave_start_date: string
          leave_type: string
          manager_user_id: string | null
          pending_issues: string | null
          return_date: string | null
          risk_notes: string | null
          status: Database["public"]["Enums"]["endorsement_status"]
          submitted_at: string | null
          submitted_by: string | null
          system_generated: boolean
          time_sensitive_deadlines: string | null
          updated_at: string
          urgency_level: Database["public"]["Enums"]["endorsement_urgency"]
        }
        Insert: {
          archived_at?: string | null
          control_number?: string | null
          created_at?: string
          department_id?: string | null
          employee_user_id: string
          id?: string
          important_warnings?: string | null
          leave_end_date: string
          leave_request_id?: string | null
          leave_start_date: string
          leave_type: string
          manager_user_id?: string | null
          pending_issues?: string | null
          return_date?: string | null
          risk_notes?: string | null
          status?: Database["public"]["Enums"]["endorsement_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          system_generated?: boolean
          time_sensitive_deadlines?: string | null
          updated_at?: string
          urgency_level?: Database["public"]["Enums"]["endorsement_urgency"]
        }
        Update: {
          archived_at?: string | null
          control_number?: string | null
          created_at?: string
          department_id?: string | null
          employee_user_id?: string
          id?: string
          important_warnings?: string | null
          leave_end_date?: string
          leave_request_id?: string | null
          leave_start_date?: string
          leave_type?: string
          manager_user_id?: string | null
          pending_issues?: string | null
          return_date?: string | null
          risk_notes?: string | null
          status?: Database["public"]["Enums"]["endorsement_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          system_generated?: boolean
          time_sensitive_deadlines?: string | null
          updated_at?: string
          urgency_level?: Database["public"]["Enums"]["endorsement_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_endorsements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsements_employee_user_id_fkey"
            columns: ["employee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsements_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: true
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsements_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_endorsements_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_exemptions: {
        Row: {
          allow_negative_pto_balance: boolean
          can_file_pto_anytime: boolean
          can_self_approve: boolean
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_negative_pto_balance?: boolean
          can_file_pto_anytime?: boolean
          can_self_approve?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_negative_pto_balance?: boolean
          can_file_pto_anytime?: boolean
          can_self_approve?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_exemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_group_approvers: {
        Row: {
          approver_id: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          approver_id: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          approver_id?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_group_approvers_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_group_approvers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "leave_approver_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "leave_approver_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_override_approvers: {
        Row: {
          approver_id: string
          created_at: string
          id: string
          override_id: string
        }
        Insert: {
          approver_id: string
          created_at?: string
          id?: string
          override_id: string
        }
        Update: {
          approver_id?: string
          created_at?: string
          id?: string
          override_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_override_approvers_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_override_approvers_override_id_fkey"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "leave_approver_overrides"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approval_mode: string | null
          approvals_completed: Json | null
          approved_at: string | null
          approved_by: string | null
          approver_id: string | null
          approver_ids: string[] | null
          created_at: string
          date_from: string
          date_to: string
          decline_notes: string | null
          duration_type: Database["public"]["Enums"]["duration_type_enum"]
          id: string
          is_backdated: boolean
          leave_type: Database["public"]["Enums"]["leave_type_enum"]
          notes: string | null
          notice_rule_met: boolean
          reason: string | null
          status: Database["public"]["Enums"]["leave_status"]
          total_hours: number
          updated_at: string
          user_id: string
          working_days_count: number
        }
        Insert: {
          approval_mode?: string | null
          approvals_completed?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          approver_id?: string | null
          approver_ids?: string[] | null
          created_at?: string
          date_from: string
          date_to: string
          decline_notes?: string | null
          duration_type?: Database["public"]["Enums"]["duration_type_enum"]
          id?: string
          is_backdated?: boolean
          leave_type: Database["public"]["Enums"]["leave_type_enum"]
          notes?: string | null
          notice_rule_met?: boolean
          reason?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          total_hours?: number
          updated_at?: string
          user_id: string
          working_days_count?: number
        }
        Update: {
          approval_mode?: string | null
          approvals_completed?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          approver_id?: string | null
          approver_ids?: string[] | null
          created_at?: string
          date_from?: string
          date_to?: string
          decline_notes?: string | null
          duration_type?: Database["public"]["Enums"]["duration_type_enum"]
          id?: string
          is_backdated?: boolean
          leave_type?: Database["public"]["Enums"]["leave_type_enum"]
          notes?: string | null
          notice_rule_met?: boolean
          reason?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          total_hours?: number
          updated_at?: string
          user_id?: string
          working_days_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          photo_mention: boolean
          photo_new: boolean
          photo_reaction: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_mention?: boolean
          photo_new?: boolean
          photo_reaction?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_mention?: boolean
          photo_new?: boolean
          photo_reaction?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string | null
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          photo_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          photo_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          photo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_comments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "user_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_hashtags: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_hashtags_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "user_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_reactions: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          reaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_reactions_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "user_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_tags: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          tagged_by_user_id: string
          tagged_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          tagged_by_user_id: string
          tagged_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          tagged_by_user_id?: string
          tagged_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_tags_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "user_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_tags_tagged_by_user_id_fkey"
            columns: ["tagged_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_tags_tagged_user_id_fkey"
            columns: ["tagged_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string
          created_at: string
          display_order: number
          icon: string
          id: string
          is_active: boolean
          is_future: boolean
          name: string
          url: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          is_future?: boolean
          name: string
          url: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          is_future?: boolean
          name?: string
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accrual_start_date: string | null
          city_province: string | null
          country: string | null
          created_at: string | null
          current_address: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_number: string | null
          employee_id: string | null
          employment_type: string | null
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          mobile_number: string | null
          permanent_address: string | null
          personal_email: string | null
          postal_code: string | null
          probation_end_date: string | null
          profile_photo_url: string | null
          profile_updated_at: string | null
          profile_updated_by: string | null
          pushover_enabled: boolean
          pushover_user_key: string | null
          reporting_manager_id: string | null
          schedule_id: string | null
          schedule_type: string | null
          start_date: string | null
          work_end_time: string | null
          work_location: string | null
          work_start_time: string | null
          work_timezone: string | null
        }
        Insert: {
          accrual_start_date?: string | null
          city_province?: string | null
          country?: string | null
          created_at?: string | null
          current_address?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          employee_id?: string | null
          employment_type?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          mobile_number?: string | null
          permanent_address?: string | null
          personal_email?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          profile_photo_url?: string | null
          profile_updated_at?: string | null
          profile_updated_by?: string | null
          pushover_enabled?: boolean
          pushover_user_key?: string | null
          reporting_manager_id?: string | null
          schedule_id?: string | null
          schedule_type?: string | null
          start_date?: string | null
          work_end_time?: string | null
          work_location?: string | null
          work_start_time?: string | null
          work_timezone?: string | null
        }
        Update: {
          accrual_start_date?: string | null
          city_province?: string | null
          country?: string | null
          created_at?: string | null
          current_address?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          employee_id?: string | null
          employment_type?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          mobile_number?: string | null
          permanent_address?: string | null
          personal_email?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          profile_photo_url?: string | null
          profile_updated_at?: string | null
          profile_updated_by?: string | null
          pushover_enabled?: boolean
          pushover_user_key?: string | null
          reporting_manager_id?: string | null
          schedule_id?: string | null
          schedule_type?: string | null
          start_date?: string | null
          work_end_time?: string | null
          work_location?: string | null
          work_start_time?: string | null
          work_timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_allocations: {
        Row: {
          accrual_ledger_id: string
          created_at: string
          deduction_ledger_id: string
          hours_allocated: number
          id: string
        }
        Insert: {
          accrual_ledger_id: string
          created_at?: string
          deduction_ledger_id: string
          hours_allocated: number
          id?: string
        }
        Update: {
          accrual_ledger_id?: string
          created_at?: string
          deduction_ledger_id?: string
          hours_allocated?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_allocations_accrual_ledger_id_fkey"
            columns: ["accrual_ledger_id"]
            isOneToOne: false
            referencedRelation: "pto_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_allocations_deduction_ledger_id_fkey"
            columns: ["deduction_ledger_id"]
            isOneToOne: false
            referencedRelation: "pto_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          earned_at: string | null
          entry_type: Database["public"]["Enums"]["pto_entry_type"]
          expires_at: string | null
          hours: number
          id: string
          notes: string | null
          related_request_id: string | null
          remaining_hours: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          earned_at?: string | null
          entry_type: Database["public"]["Enums"]["pto_entry_type"]
          expires_at?: string | null
          hours: number
          id?: string
          notes?: string | null
          related_request_id?: string | null
          remaining_hours?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          earned_at?: string | null
          entry_type?: Database["public"]["Enums"]["pto_entry_type"]
          expires_at?: string | null
          hours?: number
          id?: string
          notes?: string | null
          related_request_id?: string | null
          remaining_hours?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_ledger_related_request_id_fkey"
            columns: ["related_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          active: boolean
          created_at: string
          hours_per_day: number
          id: string
          is_default: boolean
          name: string
          updated_at: string
          working_days: number[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          hours_per_day?: number
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          working_days?: number[]
        }
        Update: {
          active?: boolean
          created_at?: string
          hours_per_day?: number
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          working_days?: number[]
        }
        Relationships: []
      }
      ticket_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          from_value: Json | null
          id: string
          ticket_id: string
          to_value: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          from_value?: Json | null
          id?: string
          ticket_id: string
          to_value?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          from_value?: Json | null
          id?: string
          ticket_id?: string
          to_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_activity_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_assignees: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_assignees_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_assignees_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          comment_id: string | null
          created_at: string | null
          file_name: string
          file_path: string
          id: string
          is_inline: boolean
          mime_type: string | null
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string | null
          file_name: string
          file_path: string
          id?: string
          is_inline?: boolean
          mime_type?: string | null
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string
          id?: string
          is_inline?: boolean
          mime_type?: string | null
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_collaborators: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_collaborators_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_collaborators_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string | null
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_departments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_survey: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          rating: number
          requester_id: string
          ticket_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          rating: number
          requester_id: string
          ticket_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          rating?: number
          requester_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_survey_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_survey_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assignee_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          client_impact: Database["public"]["Enums"]["client_impact_enum"]
          closed_at: string | null
          closed_by: string | null
          closure_confirmation_status: Database["public"]["Enums"]["closure_confirm_enum"]
          closure_confirmed_at: string | null
          created_at: string | null
          critical_justification: string | null
          department_id: string
          description: string
          escalated_to_manager_at: string | null
          escalated_to_super_admin_at: string | null
          final_overdue_seconds: number | null
          first_response_at: string | null
          id: string
          last_activity_at: string | null
          merged_into_id: string | null
          primary_assignee_id: string | null
          priority: Database["public"]["Enums"]["priority_enum"]
          reopened_at: string | null
          reopened_count: number
          requester_id: string
          sla_breached_at: string | null
          sla_due_at: string
          status: Database["public"]["Enums"]["status_enum"]
          ticket_no: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_impact?: Database["public"]["Enums"]["client_impact_enum"]
          closed_at?: string | null
          closed_by?: string | null
          closure_confirmation_status?: Database["public"]["Enums"]["closure_confirm_enum"]
          closure_confirmed_at?: string | null
          created_at?: string | null
          critical_justification?: string | null
          department_id: string
          description: string
          escalated_to_manager_at?: string | null
          escalated_to_super_admin_at?: string | null
          final_overdue_seconds?: number | null
          first_response_at?: string | null
          id?: string
          last_activity_at?: string | null
          merged_into_id?: string | null
          primary_assignee_id?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"]
          reopened_at?: string | null
          reopened_count?: number
          requester_id: string
          sla_breached_at?: string | null
          sla_due_at: string
          status?: Database["public"]["Enums"]["status_enum"]
          ticket_no: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_impact?: Database["public"]["Enums"]["client_impact_enum"]
          closed_at?: string | null
          closed_by?: string | null
          closure_confirmation_status?: Database["public"]["Enums"]["closure_confirm_enum"]
          closure_confirmed_at?: string | null
          created_at?: string | null
          critical_justification?: string | null
          department_id?: string
          description?: string
          escalated_to_manager_at?: string | null
          escalated_to_super_admin_at?: string | null
          final_overdue_seconds?: number | null
          first_response_at?: string | null
          id?: string
          last_activity_at?: string | null
          merged_into_id?: string | null
          primary_assignee_id?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"]
          reopened_at?: string | null
          reopened_count?: number
          requester_id?: string
          sla_breached_at?: string | null
          sla_due_at?: string
          status?: Database["public"]["Enums"]["status_enum"]
          ticket_no?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_primary_assignee_id_fkey"
            columns: ["primary_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_events: {
        Row: {
          app_name: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_name: string
          id: string
          metadata: Json | null
          module_name: string
          occurred_at: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          app_name?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name: string
          id?: string
          metadata?: Json | null
          module_name: string
          occurred_at?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          app_name?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name?: string
          id?: string
          metadata?: Json | null
          module_name?: string
          occurred_at?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_login_events: {
        Row: {
          app_name: string
          created_at: string
          id: string
          ip_address: string | null
          login_at: string
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_name?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          login_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_name?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          login_at?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_photos: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_product_access: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_product_access_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_product_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      user_saved_signatures: {
        Row: {
          created_at: string
          id: string
          signature_data: string
          signature_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          signature_data: string
          signature_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          signature_data?: string
          signature_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          active_seconds: number
          app_name: string
          created_at: string
          ended_at: string | null
          id: string
          is_active: boolean
          last_seen_at: string
          started_at: string
          user_id: string
        }
        Insert: {
          active_seconds?: number
          app_name?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          started_at?: string
          user_id: string
        }
        Update: {
          active_seconds?: number
          app_name?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_pushover_status: {
        Args: never
        Returns: {
          departments: string[]
          email: string
          full_name: string
          has_key: boolean
          pushover_enabled: boolean
          pushover_user_key: string
          user_id: string
        }[]
      }
      admin_set_pushover_key: {
        Args: { _enabled: boolean; _target_user_id: string; _user_key: string }
        Returns: undefined
      }
      auto_assign_ticket: { Args: { _dept_id: string }; Returns: string }
      can_access_ticket: {
        Args: { _ticket_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_documents: { Args: { _user_id: string }; Returns: boolean }
      can_manage_kb: { Args: { _user_id: string }; Returns: boolean }
      can_manage_pushover_for: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      can_view_endorsement: {
        Args: { _endorsement_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_kb_doc: {
        Args: { _doc_id: string; _user_id: string }
        Returns: boolean
      }
      count_everyone_today: { Args: { _user_id: string }; Returns: number }
      generate_ticket_no: { Args: { _dept_id: string }; Returns: string }
      get_adoption_alerts: { Args: never; Returns: Json }
      get_adoption_kpis: {
        Args: { _app?: string; _dept_id?: string }
        Returns: Json
      }
      get_dept_adoption: { Args: never; Returns: Json }
      get_login_trend: {
        Args: { _app?: string; _dept_id?: string; _from: string; _to: string }
        Returns: Json
      }
      get_module_usage: {
        Args: { _app?: string; _dept_id?: string; _from: string; _to: string }
        Returns: Json
      }
      get_user_adoption_table: {
        Args: { _app: string; _dept_id?: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_dept_manager: { Args: { _user_id: string }; Returns: boolean }
      is_bulletin_poster: { Args: { _user_id: string }; Returns: boolean }
      is_dept_manager: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
      is_document_recipient: {
        Args: { _document_id: string; _user_id: string }
        Returns: boolean
      }
      is_document_signer: {
        Args: { _document_id: string; _user_id: string }
        Returns: boolean
      }
      is_pc_member: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_ticket_assignee: {
        Args: { _ticket_id: string; _user_id: string }
        Returns: boolean
      }
      reopen_ticket: {
        Args: { _reason: string; _ticket_id: string }
        Returns: Json
      }
      search_my_tickets: {
        Args: { _search_term: string; _user_id: string }
        Returns: {
          match_context: string
          match_rank: number
          match_snippet: string
          ticket_id: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "manager" | "employee"
      client_impact_enum: "no" | "potential" | "yes"
      closure_confirm_enum: "pending" | "resolved_yes" | "resolved_no"
      duration_type_enum: "full_day" | "half_day_am" | "half_day_pm"
      endorsement_priority: "normal" | "high" | "critical"
      endorsement_status:
        | "draft"
        | "pending_submission"
        | "pending_acknowledgement"
        | "acknowledged"
        | "cancelled"
        | "open"
        | "in_progress"
        | "closed"
      endorsement_task_type:
        | "daily_recurring"
        | "weekly_recurring"
        | "monthly_recurring"
        | "one_time"
        | "client_follow_up"
        | "internal_admin"
        | "monitoring"
      endorsement_urgency: "normal" | "high" | "critical"
      leave_status:
        | "draft"
        | "submitted"
        | "approved"
        | "declined"
        | "cancelled"
        | "withdrawn"
      leave_type_enum: "paid_pto" | "unpaid_leave" | "birthday_leave"
      priority_enum: "normal" | "critical" | "low"
      pto_entry_type:
        | "accrual"
        | "deduction"
        | "adjustment"
        | "reversal"
        | "expired"
      status_enum: "open" | "in_progress" | "blocked" | "for_review" | "closed"
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
      app_role: ["super_admin", "manager", "employee"],
      client_impact_enum: ["no", "potential", "yes"],
      closure_confirm_enum: ["pending", "resolved_yes", "resolved_no"],
      duration_type_enum: ["full_day", "half_day_am", "half_day_pm"],
      endorsement_priority: ["normal", "high", "critical"],
      endorsement_status: [
        "draft",
        "pending_submission",
        "pending_acknowledgement",
        "acknowledged",
        "cancelled",
        "open",
        "in_progress",
        "closed",
      ],
      endorsement_task_type: [
        "daily_recurring",
        "weekly_recurring",
        "monthly_recurring",
        "one_time",
        "client_follow_up",
        "internal_admin",
        "monitoring",
      ],
      endorsement_urgency: ["normal", "high", "critical"],
      leave_status: [
        "draft",
        "submitted",
        "approved",
        "declined",
        "cancelled",
        "withdrawn",
      ],
      leave_type_enum: ["paid_pto", "unpaid_leave", "birthday_leave"],
      priority_enum: ["normal", "critical", "low"],
      pto_entry_type: [
        "accrual",
        "deduction",
        "adjustment",
        "reversal",
        "expired",
      ],
      status_enum: ["open", "in_progress", "blocked", "for_review", "closed"],
    },
  },
} as const
