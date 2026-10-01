-- 0029_card_payments
--
-- Fee payments by card, through Paystack's hosted checkout (see
-- supabase/functions/_shared/card.ts). The payments table already has the
-- channel, provider, card_last4 and card_brand columns (0010); the method
-- enum only lacked a value for a card.
--
-- Settlement is unchanged: settle_fee_payment and settle_subscription_payment
-- serve both channels, with the same lock, amount check and replay guard.

alter type public.payment_method add value if not exists 'card';
