// ---------------------------------------------------------------------------
// Persistent bridge settings + append-only bridge audit trail
// (founding-membership activation, phase A).
//
// Exemplar-pattern store: pure row mappers, in-memory reference, Supabase
// implementation with an injected client, resolver fallback. The settings are
// one logical row (id "bridge"); the audit events are APPEND-ONLY (no update
// or delete in the port, and a database trigger enforces the same in
// supabase/research-fm-payment-methods.sql). Reads are defensive: no settings
// row reads as null, and the domain treats null settings as "no bridge", which
// fails closed. Writes are loud.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";
import type {
  BridgeAuditEvent,
  BridgeAuditKind,
  BridgeSettings,
  ReplacementProviderStatus,
} from "../bridge";

const SETTINGS_TABLE = "research_fm_bridge_settings";
const AUDIT_TABLE = "research_fm_bridge_audit_events";
const SETTINGS_ROW_ID = "bridge";
const UNIQUE_VIOLATION = "23505";

export class BridgeAuditEventDuplicate extends Error {
  constructor(eventId: string) {
    super(`Bridge audit event ${eventId} already exists; audit events are written exactly once.`);
    this.name = "BridgeAuditEventDuplicate";
  }
}

// ---------------------------------------------------------------------------
// Rows and pure mappers
// ---------------------------------------------------------------------------

export interface BridgeSettingsRow {
  id: string;
  bridge_enabled: boolean;
  start_at: string;
  end_at: string;
  timezone: string;
  accepting_new_activation_payments: boolean;
  accepting_existing_obligation_payments: boolean;
  replacement_provider_status: string;
  administrator_emergency_disable: boolean;
  administrator_extension_reason: string | null;
  administrator_extension_expires_at: string | null;
}

export const BRIDGE_SETTINGS_COLUMNS =
  "id, bridge_enabled, start_at, end_at, timezone, accepting_new_activation_payments, " +
  "accepting_existing_obligation_payments, replacement_provider_status, administrator_emergency_disable, " +
  "administrator_extension_reason, administrator_extension_expires_at";

export function bridgeSettingsToRow(settings: BridgeSettings): BridgeSettingsRow {
  return {
    id: SETTINGS_ROW_ID,
    bridge_enabled: settings.bridgeEnabled,
    start_at: settings.startAt,
    end_at: settings.endAt,
    timezone: settings.timezone,
    accepting_new_activation_payments: settings.acceptingNewActivationPayments,
    accepting_existing_obligation_payments: settings.acceptingExistingObligationPayments,
    replacement_provider_status: settings.replacementProviderStatus,
    administrator_emergency_disable: settings.administratorEmergencyDisable,
    administrator_extension_reason: settings.administratorExtensionReason,
    administrator_extension_expires_at: settings.administratorExtensionExpiresAt,
  };
}

export function bridgeSettingsRowToRecord(row: BridgeSettingsRow): BridgeSettings {
  return {
    bridgeEnabled: row.bridge_enabled,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    acceptingNewActivationPayments: row.accepting_new_activation_payments,
    acceptingExistingObligationPayments: row.accepting_existing_obligation_payments,
    replacementProviderStatus: row.replacement_provider_status as ReplacementProviderStatus,
    administratorEmergencyDisable: row.administrator_emergency_disable,
    administratorExtensionReason: row.administrator_extension_reason,
    administratorExtensionExpiresAt: row.administrator_extension_expires_at,
  };
}

export interface BridgeAuditEventRow {
  event_id: string;
  kind: string;
  actor_id: string;
  reason: string;
  at: string;
  detail: Record<string, unknown>;
}

export const BRIDGE_AUDIT_COLUMNS = "event_id, kind, actor_id, reason, at, detail";

export function bridgeAuditEventToRow(event: BridgeAuditEvent): BridgeAuditEventRow {
  return {
    event_id: event.eventId,
    kind: event.kind,
    actor_id: event.actorId,
    reason: event.reason,
    at: event.at,
    detail: event.detail,
  };
}

export function bridgeAuditEventRowToRecord(row: BridgeAuditEventRow): BridgeAuditEvent {
  return {
    eventId: row.event_id,
    kind: row.kind as BridgeAuditKind,
    actorId: row.actor_id,
    reason: row.reason,
    at: row.at,
    detail: row.detail ?? {},
  };
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * Audit events can only be appended and listed. There is no update, no delete,
 * and no way to save settings that skips the caller's decision to also append
 * the matching audit event (the domain functions return both together).
 */
export interface BridgeRepository {
  /** The one settings row, or null when the bridge was never configured. */
  getSettings(): Promise<BridgeSettings | null>;
  /** Upsert the one settings row. */
  saveSettings(settings: BridgeSettings): Promise<void>;
  /** Append one audit event. A duplicate eventId errors; events write once. */
  appendAuditEvent(event: BridgeAuditEvent): Promise<void>;
  /** The full audit trail, oldest first. */
  listAuditEvents(): Promise<readonly BridgeAuditEvent[]>;
}

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

export function createInMemoryBridgeStore(): BridgeRepository {
  let settings: BridgeSettings | null = null;
  const events: BridgeAuditEvent[] = [];
  const cloneEvent = (e: BridgeAuditEvent): BridgeAuditEvent => ({ ...e, detail: { ...e.detail } });

  return {
    async getSettings() {
      return settings ? { ...settings } : null;
    },
    async saveSettings(next) {
      settings = { ...next };
    },
    async appendAuditEvent(event) {
      if (events.some((e) => e.eventId === event.eventId)) throw new BridgeAuditEventDuplicate(event.eventId);
      events.push(cloneEvent(event));
    },
    async listAuditEvents() {
      return events
        .slice()
        .sort((a, b) => (a.at !== b.at ? (a.at < b.at ? -1 : 1) : a.eventId.localeCompare(b.eventId)))
        .map(cloneEvent);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

export function createSupabaseBridgeStore(client: SupabaseClient = getSupabaseAdmin()): BridgeRepository {
  return {
    async getSettings() {
      try {
        const { data, error } = await client
          .from(SETTINGS_TABLE)
          .select(BRIDGE_SETTINGS_COLUMNS)
          .eq("id", SETTINGS_ROW_ID)
          .maybeSingle();
        if (error || !data) return null;
        return bridgeSettingsRowToRecord(data as unknown as BridgeSettingsRow);
      } catch {
        return null;
      }
    },

    async saveSettings(settings) {
      const up = await client
        .from(SETTINGS_TABLE)
        .upsert(bridgeSettingsToRow(settings), { onConflict: "id" });
      if (up.error) throw new Error(`bridge settings save failed: ${up.error.message}`);
    },

    async appendAuditEvent(event) {
      const ins = await client.from(AUDIT_TABLE).insert(bridgeAuditEventToRow(event));
      if (ins.error) {
        if (ins.error.code === UNIQUE_VIOLATION) throw new BridgeAuditEventDuplicate(event.eventId);
        throw new Error(`bridge audit append failed: ${ins.error.message}`);
      }
    },

    async listAuditEvents() {
      try {
        const { data, error } = await client.from(AUDIT_TABLE).select(BRIDGE_AUDIT_COLUMNS);
        if (error || !Array.isArray(data)) return [];
        return (data as unknown as BridgeAuditEventRow[])
          .map(bridgeAuditEventRowToRecord)
          .sort((a, b) => (a.at !== b.at ? (a.at < b.at ? -1 : 1) : a.eventId.localeCompare(b.eventId)));
      } catch {
        return [];
      }
    },
  };
}

/** The real store when Supabase is configured, else the in-memory reference. */
export function resolveBridgeStore(): BridgeRepository {
  return supabaseConfigured() ? createSupabaseBridgeStore() : createInMemoryBridgeStore();
}
