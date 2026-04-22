import type Stripe from 'stripe';
import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import type { Deal, InsertNotification } from '@shared/schema';

export type StripeDealProjection = Pick<Deal, 'id' | 'seekerId' | 'providerId'>;

export type StripeDealUpdate = Partial<
  Pick<Deal, 'state' | 'stripePaymentId' | 'updatedAt'>
>;

export interface StripeWebhookStorage {
  getDeal(id: string): Promise<StripeDealProjection | undefined>;
  updateDeal(
    id: string,
    data: StripeDealUpdate,
  ): Promise<StripeDealProjection | undefined>;
  createNotification(notification: InsertNotification): Promise<unknown>;
}

export interface StripeWebhookDeps {
  storage: StripeWebhookStorage;
  processWebhook: (payload: Buffer, signature: string) => Promise<Stripe.Event>;
}

export function makeStripeWebhookHandler(deps: StripeWebhookDeps) {
  return async function processStripeWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const event = await deps.processWebhook(payload, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const dealId = session.metadata?.dealId;

      if (dealId) {
        // Indexed lookup: deals.id is the primary key. Never fall back to
        // a getAllDeals() scan — the regression test in tests/security.test.ts
        // asserts this invariant via a stub storage.
        await deps.storage.updateDeal(dealId, {
          state: 'completed',
          stripePaymentId: session.payment_intent as string,
        });

        const deal = await deps.storage.getDeal(dealId);
        if (deal) {
          await deps.storage.createNotification({
            userId: deal.seekerId,
            type: 'deal_update',
            title: 'Deal Completed',
            message: 'Payment received! Your deal is now complete. You can now rate your bartering partner.',
            relatedDealId: dealId,
          });
          await deps.storage.createNotification({
            userId: deal.providerId,
            type: 'deal_update',
            title: 'Deal Completed',
            message: 'Payment received! Your deal is now complete. You can now rate your bartering partner.',
            relatedDealId: dealId,
          });
        }
      }
    }
  };
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const sync = await getStripeSync();
    const handler = makeStripeWebhookHandler({
      storage,
      processWebhook: (buf, sig) => sync.processWebhook(buf, sig),
    });
    return handler(payload, signature);
  }
}
