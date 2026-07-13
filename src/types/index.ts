/**
 * Shared domain types for VUCEM automation.
 *
 * Keep types here that appear in more than one layer.
 * Types used only inside one file can be defined inline there.
 */

// ─── Applicant ────────────────────────────────────────────────────────────────

export interface ApplicantData {
  name: string;
  rfc: string;
  curp?: string;
  email?: string;
  phone?: string;
  state?: string;
  municipality?: string;
  address?: string;
  postalCode?: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentData {
  /** The document type key as used in the VUCEM upload UI (e.g. 'acta_constitutiva') */
  type: string;
  /** Path relative to the project root (e.g. './test-data/files/acta.pdf') */
  path: string;
  description?: string;
}

// ─── Procedure ────────────────────────────────────────────────────────────────

export interface ProcedureTestData {
  applicant: ApplicantData;
  documents: DocumentData[];
  /** Any procedure-specific fields not covered by ApplicantData */
  extras?: Record<string, string>;
}

// ─── Authentication ─────────────────────────────────────────────────────────

/**
 * e.firma (FIEL) certificate credentials — VUCEM's real auth + signing method.
 * Paths are relative to the project root.
 */
export interface EfirmaCredentials {
  /** Path to the .cer certificate file */
  cerPath: string;
  /** Path to the .key private-key file */
  keyPath: string;
  /** Private-key password */
  password: string;
}

// ─── Environment ──────────────────────────────────────────────────────────────

export interface EnvConfig {
  baseUrl: string;
  /** Username/password login (fallback when no e.firma block is present). */
  credentials?: {
    username: string;
    password: string;
  };
  /** e.firma login credentials. When present, auth.setup uses e.firma. */
  efirma?: EfirmaCredentials;
  /** Working role to select after login, e.g. 'Persona Moral'. */
  role?: string;
}
