import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    const event = await sync.processWebhook(payload, signature);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const dealId = session.metadata?.dealId;
      
      if (dealId) {
        await storage.updateDeal(dealId, {
          state: 'completed',
          stripePaymentId: session.payment_intent as string,
        });
        
        const deal = await storage.getDeal(dealId);
        if (deal) {
          await storage.createNotification({
            userId: deal.seekerId,
            type: 'deal_update',
            title: 'Deal Completed',
            message: 'Payment received! Your deal is now complete. You can now rate your bartering partner.',
            relatedDealId: dealId,
          });
          await storage.createNotification({
            userId: deal.providerId,
            type: 'deal_update',
            title: 'Deal Completed',
            message: 'Payment received! Your deal is now complete. You can now rate your bartering partner.',
            relatedDealId: dealId,
          });
        }
      }
    }
  }
}
