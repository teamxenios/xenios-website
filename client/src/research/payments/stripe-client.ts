// The provider's browser library, loaded from the provider's own domain.
//
// Stripe.js is never bundled: PCI guidance requires it to be served by Stripe,
// and the app carries no @stripe dependency. One loader serves both the card
// collection (Elements) and the customer-authentication flow (handleNextAction)
// so the script is fetched once per page. Only the minimal surface the app
// uses is typed here; nothing else of the library is reached.
export interface StripeCardElement {
  mount(target: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  on(event: "change", handler: (event: { complete?: boolean; error?: { message?: string } }) => void): void;
}

export interface StripeElements {
  create(type: "card", options?: Record<string, unknown>): StripeCardElement;
}

export interface StripeClient {
  elements(options?: Record<string, unknown>): StripeElements;
  /** Tokenizes the card inside the provider-hosted element; the app sees only a pm_ reference. */
  createPaymentMethod(input: { type: "card"; card: StripeCardElement }): Promise<{ paymentMethod?: { id?: string }; error?: { message?: string; code?: string } }>;
  /** The documented client flow for a confirmed intent that needs the customer. */
  handleNextAction(input: { clientSecret: string }): Promise<{ paymentIntent?: { status?: string }; error?: { type?: string; code?: string } }>;
}

export type StripeFactory = (publishableKey: string) => StripeClient;

const SCRIPT_SRC = "https://js.stripe.com/v3/";
let loading: Promise<StripeFactory> | null = null;

export function loadStripeFactory(): Promise<StripeFactory> {
  const existing = (window as unknown as { Stripe?: StripeFactory }).Stripe;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise<StripeFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error("Payment library unavailable"));
    };
    const timer = setTimeout(fail, 15_000);
    script.onload = () => {
      clearTimeout(timer);
      const factory = (window as unknown as { Stripe?: StripeFactory }).Stripe;
      if (factory) resolve(factory);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}

const clients = new Map<string, StripeClient>();

/** One client per publishable key for the life of the page. */
export async function stripeClient(publishableKey: string): Promise<StripeClient> {
  const cached = clients.get(publishableKey);
  if (cached) return cached;
  const factory = await loadStripeFactory();
  const client = factory(publishableKey);
  clients.set(publishableKey, client);
  return client;
}

/** Test seam: forget cached clients so a test can install another window.Stripe. */
export function __resetStripeClients(): void {
  clients.clear();
  loading = null;
}
