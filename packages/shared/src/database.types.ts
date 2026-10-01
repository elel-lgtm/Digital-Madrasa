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
      admission_counters: {
        Row: {
          admission_year: number
          last_seq: number
        }
        Insert: {
          admission_year: number
          last_seq?: number
        }
        Update: {
          admission_year?: number
          last_seq?: number
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string[]
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          madrasa_id: string
          publish_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience: string[]
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          madrasa_id: string
          publish_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string[]
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          madrasa_id?: string
          publish_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          class_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_at: string
          id: string
          instructions: string
          lesson_id: string | null
          madrasa_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          class_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_at: string
          id?: string
          instructions: string
          lesson_id?: string | null
          madrasa_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          class_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_at?: string
          id?: string
          instructions?: string
          lesson_id?: string | null
          madrasa_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          deleted_at: string | null
          id: string
          madrasa_id: string
          marked_by: string | null
          method: Database["public"]["Enums"]["attendance_method"]
          note: string | null
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id: string
          marked_by?: string | null
          method?: Database["public"]["Enums"]["attendance_method"]
          note?: string | null
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id?: string
          marked_by?: string | null
          method?: Database["public"]["Enums"]["attendance_method"]
          note?: string | null
          session_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
          madrasa_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
          madrasa_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
          madrasa_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      certificates: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          issued_at: string
          kind: string
          madrasa_id: string
          pdf_url: string | null
          student_id: string
          title: string
          verification_code: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          issued_at?: string
          kind: string
          madrasa_id: string
          pdf_url?: string | null
          student_id: string
          title: string
          verification_code: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          issued_at?: string
          kind?: string
          madrasa_id?: string
          pdf_url?: string | null
          student_id?: string
          title?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity: number
          created_at: string
          deleted_at: string | null
          id: string
          level: string
          madrasa_id: string
          name: string
          schedule: Json
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          level: string
          madrasa_id: string
          name: string
          schedule?: Json
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          level?: string
          madrasa_id?: string
          name?: string
          schedule?: Json
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_fk"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_id: string
          deleted_at: string | null
          id: string
          joined_at: string
          madrasa_id: string
          status: string
          student_id: string
        }
        Insert: {
          class_id: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          madrasa_id: string
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          madrasa_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          ai_evaluation: boolean
          leaderboard: boolean
          madrasa_id: string
          offline_mode: boolean
          payments: boolean
          sms_fallback: boolean
          updated_at: string
        }
        Insert: {
          ai_evaluation?: boolean
          leaderboard?: boolean
          madrasa_id: string
          offline_mode?: boolean
          payments?: boolean
          sms_fallback?: boolean
          updated_at?: string
        }
        Update: {
          ai_evaluation?: boolean
          leaderboard?: boolean
          madrasa_id?: string
          offline_mode?: boolean
          payments?: boolean
          sms_fallback?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: true
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year: number
          amount: number
          applies_to: Database["public"]["Enums"]["fee_scope"]
          class_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          is_active: boolean
          madrasa_id: string
          name: string
          student_id: string | null
          term: string
          updated_at: string
        }
        Insert: {
          academic_year: number
          amount: number
          applies_to: Database["public"]["Enums"]["fee_scope"]
          class_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          madrasa_id: string
          name: string
          student_id?: string | null
          term: string
          updated_at?: string
        }
        Update: {
          academic_year?: number
          amount?: number
          applies_to?: Database["public"]["Enums"]["fee_scope"]
          class_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          madrasa_id?: string
          name?: string
          student_id?: string | null
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          class_id: string
          created_at: string
          deleted_at: string | null
          id: string
          issued_by: string | null
          madrasa_id: string
          max_score: number
          remarks: string | null
          score: number
          student_id: string
          subject: string
          term: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          issued_by?: string | null
          madrasa_id: string
          max_score: number
          remarks?: string | null
          score: number
          student_id: string
          subject: string
          term: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          issued_by?: string | null
          madrasa_id?: string
          max_score?: number
          remarks?: string | null
          score?: number
          student_id?: string
          subject?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      hifz_progress: {
        Row: {
          ayah_no: number
          confidence_score: number | null
          created_at: string
          deleted_at: string | null
          id: string
          juz_no: number
          last_revised_at: string | null
          madrasa_id: string
          next_review_at: string | null
          status: Database["public"]["Enums"]["hifz_status"]
          student_id: string
          surah_no: number
          updated_at: string
        }
        Insert: {
          ayah_no: number
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          juz_no: number
          last_revised_at?: string | null
          madrasa_id: string
          next_review_at?: string | null
          status?: Database["public"]["Enums"]["hifz_status"]
          student_id: string
          surah_no: number
          updated_at?: string
        }
        Update: {
          ayah_no?: number
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          juz_no?: number
          last_revised_at?: string | null
          madrasa_id?: string
          next_review_at?: string | null
          status?: Database["public"]["Enums"]["hifz_status"]
          student_id?: string
          surah_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hifz_progress_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hifz_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          currency: string
          deleted_at: string | null
          description: string
          due_date: string
          fee_structure_id: string | null
          id: string
          invoice_no: string
          issued_at: string | null
          madrasa_id: string
          notes: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description: string
          due_date: string
          fee_structure_id?: string | null
          id?: string
          invoice_no: string
          issued_at?: string | null
          madrasa_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string
          due_date?: string
          fee_structure_id?: string | null
          id?: string
          invoice_no?: string
          issued_at?: string | null
          madrasa_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          ayah_from: number
          ayah_to: number
          class_id: string
          created_at: string
          deleted_at: string | null
          id: string
          madrasa_id: string
          meeting_url: string | null
          notes: string | null
          qiraah_style: Database["public"]["Enums"]["qiraah_style"]
          resource_urls: string[]
          scheduled_for: string | null
          surah_from: number
          surah_to: number
          title: string
          updated_at: string
        }
        Insert: {
          ayah_from: number
          ayah_to: number
          class_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id: string
          meeting_url?: string | null
          notes?: string | null
          qiraah_style?: Database["public"]["Enums"]["qiraah_style"]
          resource_urls?: string[]
          scheduled_for?: string | null
          surah_from: number
          surah_to: number
          title: string
          updated_at?: string
        }
        Update: {
          ayah_from?: number
          ayah_to?: number
          class_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id?: string
          meeting_url?: string | null
          notes?: string | null
          qiraah_style?: Database["public"]["Enums"]["qiraah_style"]
          resource_urls?: string[]
          scheduled_for?: string | null
          surah_from?: number
          surah_to?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
        ]
      }
      madrasas: {
        Row: {
          contact_email: string
          contact_phone: string
          county: string
          created_at: string
          deleted_at: string | null
          deletion_reason: string | null
          deletion_scheduled_at: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["madrasa_status"]
          timezone: string
          town: string
          updated_at: string
        }
        Insert: {
          contact_email: string
          contact_phone: string
          county: string
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_scheduled_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          slug: string
          status?: Database["public"]["Enums"]["madrasa_status"]
          timezone?: string
          town: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_phone?: string
          county?: string
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_scheduled_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["madrasa_status"]
          timezone?: string
          town?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "madrasas_owner_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_outbox: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          madrasa_id: string | null
          payload: Json
          provider_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["mail_status"]
          template: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          madrasa_id?: string | null
          payload?: Json
          provider_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["mail_status"]
          template: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          madrasa_id?: string | null
          payload?: Json
          provider_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["mail_status"]
          template?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_outbox_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          last_message_at: string
          madrasa_id: string
          participant_a: string
          participant_b: string
          student_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string
          madrasa_id: string
          participant_a: string
          participant_b: string
          student_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string
          madrasa_id?: string
          participant_a?: string
          participant_b?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_participant_a_fkey"
            columns: ["participant_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_participant_b_fkey"
            columns: ["participant_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          madrasa_id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachment_url?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
          thread_id: string
        }
        Update: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          preferences?: Json
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
          body: string
          channel: string[]
          created_at: string
          id: string
          madrasa_id: string | null
          payload: Json
          read_at: string | null
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string[]
          created_at?: string
          id?: string
          madrasa_id?: string | null
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string[]
          created_at?: string
          id?: string
          madrasa_id?: string | null
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
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
      parent_student_links: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          deleted_at: string | null
          id: string
          madrasa_id: string
          parent_id: string
          reason: string | null
          relationship: Database["public"]["Enums"]["relationship_type"]
          requested_at: string
          status: Database["public"]["Enums"]["link_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          id?: string
          madrasa_id: string
          parent_id: string
          reason?: string | null
          relationship: Database["public"]["Enums"]["relationship_type"]
          requested_at?: string
          status?: Database["public"]["Enums"]["link_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          id?: string
          madrasa_id?: string
          parent_id?: string
          reason?: string | null
          relationship?: Database["public"]["Enums"]["relationship_type"]
          requested_at?: string
          status?: Database["public"]["Enums"]["link_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          madrasa_id: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          madrasa_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          madrasa_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          madrasa_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          card_brand: Database["public"]["Enums"]["card_brand"] | null
          card_last4: string | null
          channel: Database["public"]["Enums"]["payment_channel"] | null
          checkout_request_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          madrasa_id: string
          method: Database["public"]["Enums"]["payment_method"]
          parent_id: string | null
          provider: Database["public"]["Enums"]["payment_provider"] | null
          provider_ref: string | null
          raw_callback: Json | null
          saved_card_id: string | null
          settled_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          card_brand?: Database["public"]["Enums"]["card_brand"] | null
          card_last4?: string | null
          channel?: Database["public"]["Enums"]["payment_channel"] | null
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          madrasa_id: string
          method: Database["public"]["Enums"]["payment_method"]
          parent_id?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"] | null
          provider_ref?: string | null
          raw_callback?: Json | null
          saved_card_id?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          card_brand?: Database["public"]["Enums"]["card_brand"] | null
          card_last4?: string | null
          channel?: Database["public"]["Enums"]["payment_channel"] | null
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          madrasa_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          parent_id?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"] | null
          provider_ref?: string | null
          raw_callback?: Json | null
          saved_card_id?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_saved_card_id_fkey"
            columns: ["saved_card_id"]
            isOneToOne: false
            referencedRelation: "saved_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_platform_admin: boolean
          locale: string
          madrasa_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_platform_admin?: boolean
          locale?: string
          madrasa_id?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_platform_admin?: boolean
          locale?: string
          madrasa_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          id: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          key: string
          window_start: string
        }
        Update: {
          count?: number
          id?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string
          emailed_at: string | null
          id: string
          madrasa_id: string
          payment_id: string
          pdf_url: string | null
          receipt_no: string
        }
        Insert: {
          created_at?: string
          emailed_at?: string | null
          id?: string
          madrasa_id: string
          payment_id: string
          pdf_url?: string | null
          receipt_no: string
        }
        Update: {
          created_at?: string
          emailed_at?: string | null
          id?: string
          madrasa_id?: string
          payment_id?: string
          pdf_url?: string | null
          receipt_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      recitations: {
        Row: {
          assignment_id: string | null
          audio_url: string
          ayah_from: number
          ayah_to: number
          created_at: string
          deleted_at: string | null
          duration_ms: number
          id: string
          madrasa_id: string
          qiraah_style: Database["public"]["Enums"]["qiraah_style"]
          student_id: string
          surah_no: number
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          audio_url: string
          ayah_from: number
          ayah_to: number
          created_at?: string
          deleted_at?: string | null
          duration_ms: number
          id?: string
          madrasa_id: string
          qiraah_style: Database["public"]["Enums"]["qiraah_style"]
          student_id: string
          surah_no: number
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          audio_url?: string
          ayah_from?: number
          ayah_to?: number
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number
          id?: string
          madrasa_id?: string
          qiraah_style?: Database["public"]["Enums"]["qiraah_style"]
          student_id?: string
          surah_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recitations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recitations_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recitations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_cards: {
        Row: {
          brand: Database["public"]["Enums"]["card_brand"]
          created_at: string
          deleted_at: string | null
          expiry_month: number
          expiry_year: number
          holder_name: string
          id: string
          is_default: boolean
          last4: string
          madrasa_id: string
          parent_id: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_token: string
          updated_at: string
        }
        Insert: {
          brand?: Database["public"]["Enums"]["card_brand"]
          created_at?: string
          deleted_at?: string | null
          expiry_month: number
          expiry_year: number
          holder_name: string
          id?: string
          is_default?: boolean
          last4: string
          madrasa_id: string
          parent_id?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_token: string
          updated_at?: string
        }
        Update: {
          brand?: Database["public"]["Enums"]["card_brand"]
          created_at?: string
          deleted_at?: string | null
          expiry_month?: number
          expiry_year?: number
          holder_name?: string
          id?: string
          is_default?: boolean
          last4?: string
          madrasa_id?: string
          parent_id?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_cards_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_cards_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_no: string
          admission_year: number
          class_id: string | null
          created_at: string
          date_of_birth: string
          deleted_at: string | null
          enrollment_status: Database["public"]["Enums"]["enrollment_status"]
          gender: string
          guardian_notes: string | null
          id: string
          madrasa_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          admission_no: string
          admission_year: number
          class_id?: string | null
          created_at?: string
          date_of_birth: string
          deleted_at?: string | null
          enrollment_status?: Database["public"]["Enums"]["enrollment_status"]
          gender: string
          guardian_notes?: string | null
          id?: string
          madrasa_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          admission_no?: string
          admission_year?: number
          class_id?: string | null
          created_at?: string
          date_of_birth?: string
          deleted_at?: string | null
          enrollment_status?: Database["public"]["Enums"]["enrollment_status"]
          gender?: string
          guardian_notes?: string | null
          id?: string
          madrasa_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          audio_url: string | null
          created_at: string
          deleted_at: string | null
          id: string
          madrasa_id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string
          text_body: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          audio_url?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string
          text_body?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          audio_url?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          madrasa_id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string
          text_body?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_no: string
          issued_at: string
          madrasa_id: string
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string
          updated_at: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          invoice_no: string
          issued_at?: string
          madrasa_id: string
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_no?: string
          issued_at?: string
          madrasa_id?: string
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          card_brand: Database["public"]["Enums"]["card_brand"] | null
          card_last4: string | null
          channel: Database["public"]["Enums"]["payment_channel"]
          checkout_request_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          madrasa_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          raw_callback: Json | null
          settled_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_invoice_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          card_brand?: Database["public"]["Enums"]["card_brand"] | null
          card_last4?: string | null
          channel: Database["public"]["Enums"]["payment_channel"]
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          madrasa_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          raw_callback?: Json | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_invoice_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          card_brand?: Database["public"]["Enums"]["card_brand"] | null
          card_last4?: string | null
          channel?: Database["public"]["Enums"]["payment_channel"]
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          madrasa_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          raw_callback?: Json | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_invoice_id_fkey"
            columns: ["subscription_invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          amount: number
          code: string
          created_at: string
          currency: string
          features: string[]
          id: string
          interval: Database["public"]["Enums"]["billing_interval"]
          is_active: boolean
          name: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          currency?: string
          features?: string[]
          id?: string
          interval?: Database["public"]["Enums"]["billing_interval"]
          is_active?: boolean
          name: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          currency?: string
          features?: string[]
          id?: string
          interval?: Database["public"]["Enums"]["billing_interval"]
          is_active?: boolean
          name?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          default_card_id: string | null
          grace_ends_at: string | null
          id: string
          madrasa_id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          default_card_id?: string | null
          grace_ends_at?: string | null
          id?: string
          madrasa_id: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          default_card_id?: string | null
          grace_ends_at?: string | null
          id?: string
          madrasa_id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_default_card_id_fkey"
            columns: ["default_card_id"]
            isOneToOne: false
            referencedRelation: "saved_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: true
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tajweed_feedback: {
        Row: {
          created_at: string
          deleted_at: string | null
          errors: Json
          id: string
          madrasa_id: string
          model_version: string
          overall_score: number
          processing_ms: number
          recitation_id: string
          reviewed_by_teacher_id: string | null
          teacher_override: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          errors?: Json
          id?: string
          madrasa_id: string
          model_version: string
          overall_score: number
          processing_ms: number
          recitation_id: string
          reviewed_by_teacher_id?: string | null
          teacher_override?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          errors?: Json
          id?: string
          madrasa_id?: string
          model_version?: string
          overall_score?: number
          processing_ms?: number
          recitation_id?: string
          reviewed_by_teacher_id?: string | null
          teacher_override?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tajweed_feedback_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tajweed_feedback_recitation_id_fkey"
            columns: ["recitation_id"]
            isOneToOne: true
            referencedRelation: "recitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tajweed_feedback_reviewed_by_teacher_id_fkey"
            columns: ["reviewed_by_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          deleted_at: string | null
          employee_no: string
          id: string
          is_owner: boolean
          madrasa_id: string
          profile_id: string
          qiraah_styles: Database["public"]["Enums"]["qiraah_style"][]
          specialisation: string | null
          status: Database["public"]["Enums"]["teacher_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          employee_no: string
          id?: string
          is_owner?: boolean
          madrasa_id: string
          profile_id: string
          qiraah_styles?: Database["public"]["Enums"]["qiraah_style"][]
          specialisation?: string | null
          status?: Database["public"]["Enums"]["teacher_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          employee_no?: string
          id?: string
          is_owner?: boolean
          madrasa_id?: string
          profile_id?: string
          qiraah_styles?: Database["public"]["Enums"]["qiraah_style"][]
          specialisation?: string | null
          status?: Database["public"]["Enums"]["teacher_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_madrasa_id_fkey"
            columns: ["madrasa_id"]
            isOneToOne: false
            referencedRelation: "madrasas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_payment: { Args: { p_payment_id: string }; Returns: undefined }
      approved_child_ids: { Args: never; Returns: string[] }
      can_access_madrasa: { Args: { p_madrasa_id: string }; Returns: boolean }
      can_manage_lesson_meeting: {
        Args: { p_lesson_id: string }
        Returns: boolean
      }
      can_read_student: { Args: { p_student_id: string }; Returns: boolean }
      can_submit_assignment: { Args: { p_assignment_id: string }; Returns: boolean }
      withdraw_certificate: { Args: { p_certificate_id: string }; Returns: undefined }
      cancel_subscription: {
        Args: { p_reason?: string | null }
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      resume_subscription: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      set_default_card: { Args: { p_card_id: string }; Returns: undefined }
      register_push_token: { Args: { p_token: string; p_platform: string }; Returns: undefined }
      admin_platform_overview: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_madrasa_summaries: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_audit_log: { Args: { p_madrasa_id?: string | null; p_limit?: number }; Returns: Json }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      remove_saved_card: { Args: { p_card_id: string }; Returns: undefined }
      verify_certificate: {
        Args: { p_code: string }
        Returns: {
          title: string
          kind: string
          student_name: string
          madrasa_name: string
          issued_at: string
          valid: boolean
        }[]
      }
      current_madrasa_id: { Args: never; Returns: string }
      current_parent_id: { Args: never; Returns: string }
      current_role_name: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_student_id: { Args: never; Returns: string }
      is_approved_child: { Args: { p_student_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      madrasa_is_active: { Args: { p_madrasa_id: string }; Returns: boolean }
      madrasa_subscription_allows_admin: {
        Args: { p_madrasa_id: string }
        Returns: boolean
      }
      refresh_subscription_status: {
        Args: { p_madrasa_id: string }
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      register_madrasa_owner: {
        Args: {
          p_county: string
          p_email: string
          p_full_name: string
          p_locale?: string
          p_madrasa_name: string
          p_phone: string
          p_town: string
          p_user_id: string
        }
        Returns: string
      }
      register_parent: {
        Args: {
          p_email: string
          p_full_name: string
          p_locale?: string
          p_phone: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      assignment_type: "memorisation" | "recitation" | "tajweed" | "written"
      attendance_method: "manual" | "qr"
      attendance_status: "present" | "absent" | "late" | "excused"
      billing_interval: "monthly" | "yearly"
      card_brand: "visa" | "mastercard" | "amex" | "unknown"
      enrollment_status: "active" | "graduated" | "withdrawn"
      fee_scope: "all" | "class" | "student"
      hifz_status:
        | "not_started"
        | "learning"
        | "memorised"
        | "revising"
        | "mastered"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      link_status: "pending" | "approved" | "rejected" | "revoked"
      madrasa_status: "active" | "suspended" | "pending_deletion" | "deleted"
      mail_status: "queued" | "sent" | "failed"
      payment_channel: "mpesa" | "card"
      payment_method: "mpesa" | "cash" | "bank" | "stripe"
      payment_provider:
        | "daraja"
        | "paystack"
        | "flutterwave"
        | "stripe"
        | "manual"
      payment_status:
        | "initiated"
        | "pending"
        | "success"
        | "failed"
        | "reversed"
      qiraah_style: "hafs" | "warsh" | "qaloon" | "duri" | "shubah"
      relationship_type: "father" | "mother" | "guardian"
      submission_status: "pending" | "graded" | "returned"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "grace"
        | "restricted"
        | "cancelled"
      teacher_status: "active" | "invited" | "suspended"
      user_role: "student" | "teacher" | "parent" | "admin"
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
      assignment_type: ["memorisation", "recitation", "tajweed", "written"],
      attendance_method: ["manual", "qr"],
      attendance_status: ["present", "absent", "late", "excused"],
      billing_interval: ["monthly", "yearly"],
      card_brand: ["visa", "mastercard", "amex", "unknown"],
      enrollment_status: ["active", "graduated", "withdrawn"],
      fee_scope: ["all", "class", "student"],
      hifz_status: [
        "not_started",
        "learning",
        "memorised",
        "revising",
        "mastered",
      ],
      invoice_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
      link_status: ["pending", "approved", "rejected", "revoked"],
      madrasa_status: ["active", "suspended", "pending_deletion", "deleted"],
      mail_status: ["queued", "sent", "failed"],
      payment_channel: ["mpesa", "card"],
      payment_method: ["mpesa", "cash", "bank", "stripe"],
      payment_provider: [
        "daraja",
        "paystack",
        "flutterwave",
        "stripe",
        "manual",
      ],
      payment_status: ["initiated", "pending", "success", "failed", "reversed"],
      qiraah_style: ["hafs", "warsh", "qaloon", "duri", "shubah"],
      relationship_type: ["father", "mother", "guardian"],
      submission_status: ["pending", "graded", "returned"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "grace",
        "restricted",
        "cancelled",
      ],
      teacher_status: ["active", "invited", "suspended"],
      user_role: ["student", "teacher", "parent", "admin"],
    },
  },
} as const
