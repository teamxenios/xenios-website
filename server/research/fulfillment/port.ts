import type {
  AssignFulfillmentInput,
  FulfillmentAssignmentView,
  FulfillmentCommandResult,
  FulfillmentPreparationResult,
  FulfillmentQueueQuery,
  PrepareFulfillmentOrderInput,
  TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";

export interface FulfillmentOperationsPort {
  listAssignments(query: FulfillmentQueueQuery): Promise<FulfillmentAssignmentView[]>;
  prepareOrder(input: PrepareFulfillmentOrderInput): Promise<FulfillmentPreparationResult>;
  assign(input: AssignFulfillmentInput): Promise<FulfillmentCommandResult>;
  transition(input: TransitionFulfillmentInput): Promise<FulfillmentCommandResult>;
}
