import type {
  TebraAppointmentProjection,
  TebraPatientProjection,
  TebraRemoteRecord,
  TebraSyncCursor,
} from "@shared/care/tebra";

/**
 * The seam that keeps unverified upstream assumptions out of Care.
 *
 * Exact SOAP operation names, WSDL bindings, envelope shapes, practice
 * identifiers, and required permissions come from the current Tebra technical
 * guide, which Xenios does not hold yet. Naming a guessed operation here would
 * bake an unverified assumption into domain code and into tests that then look
 * like evidence. So the connector states what it needs in Xenios terms and an
 * injected practice client supplies the transport once the guide arrives.
 *
 * A conforming implementation is responsible for authenticating with the
 * account username, password, and customer key, and for never returning any
 * field beyond the correlation keys in TebraRemoteRecord.
 */
export interface TebraPracticeClient {
  findPatientByExternalId(externalId: string): Promise<TebraRemoteRecord | null>;
  createPatient(input: TebraPatientProjection): Promise<TebraRemoteRecord>;
  updatePatient(tebraId: string, input: TebraPatientProjection): Promise<TebraRemoteRecord>;
  listPatientsModified(cursor: TebraSyncCursor): Promise<TebraRemotePage>;

  findAppointmentByExternalId(externalId: string): Promise<TebraRemoteRecord | null>;
  createAppointment(input: TebraAppointmentProjection): Promise<TebraRemoteRecord>;
  updateAppointment(tebraId: string, input: TebraAppointmentProjection): Promise<TebraRemoteRecord>;
  listAppointmentsModified(cursor: TebraSyncCursor): Promise<TebraRemotePage>;
}

export interface TebraRemotePage {
  records: readonly TebraRemoteRecord[];
  nextCursor: TebraSyncCursor;
  hasMore: boolean;
}

/**
 * The default client. Every call fails with a safe code, so a partially
 * configured deployment degrades to the concierge fallback instead of making an
 * unreviewed provider call. Nothing in the connector constructs a network
 * client on its own.
 */
export class UnconfiguredTebraPracticeClient implements TebraPracticeClient {
  // Rejected rather than thrown. A method that declares a Promise but throws
  // synchronously escapes a caller that only attaches .catch, which is exactly
  // the path that would turn a refusal into an unhandled failure.
  private refuse<T>(): Promise<T> {
    return Promise.reject(new Error("tebra_unavailable"));
  }

  findPatientByExternalId(): Promise<TebraRemoteRecord | null> {
    return this.refuse();
  }

  createPatient(): Promise<TebraRemoteRecord> {
    return this.refuse();
  }

  updatePatient(): Promise<TebraRemoteRecord> {
    return this.refuse();
  }

  listPatientsModified(): Promise<TebraRemotePage> {
    return this.refuse();
  }

  findAppointmentByExternalId(): Promise<TebraRemoteRecord | null> {
    return this.refuse();
  }

  createAppointment(): Promise<TebraRemoteRecord> {
    return this.refuse();
  }

  updateAppointment(): Promise<TebraRemoteRecord> {
    return this.refuse();
  }

  listAppointmentsModified(): Promise<TebraRemotePage> {
    return this.refuse();
  }
}
