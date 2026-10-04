# USSD for parents on feature phones

Parents without a smartphone dial a short code and read their child's attendance, hifz progress, fees balance and the teacher's latest remark, in English, Kiswahili or Somali.

The server side is done and deployed: the `ussd` Edge Function and the `ussd_children` database function (migration 0033). To make it reachable from a phone, register a USSD channel with Africa's Talking.

## Try it free in the Africa's Talking sandbox

1. Create an account at africastalking.com and open the **Sandbox** app.
2. Go to **USSD → Create channel**. Pick any free sandbox code (for example `*384*1234#`).
3. Set the callback URL to:

   ```
   https://rblnistltccysizdcnvt.supabase.co/functions/v1/ussd?key=<USSD_SECRET>
   ```

   `USSD_SECRET` is in `supabase/.env` (never commit it). A request without the right key gets "Not found".
4. Open the sandbox **simulator** (developers.africastalking.com/simulator), enter the phone number of a parent account (the demo parent is `+254712000103`) and dial the code.

## Going live

Apply for a dedicated or shared service code in the Africa's Talking dashboard (Safaricom, Airtel), then point it at the same callback URL. No code changes are needed.

## How it is kept safe

- The callback secret means only Africa's Talking can query the function.
- A number reaches a child only if exactly one active parent account has that number and `can_read_student()` allows it, so it is the same rule the app uses. Pending or revoked links show nothing, and a number shared by two accounts shows nothing.
- Each number is rate-limited (40 requests an hour).
- Every screen fits in 170 characters for basic phones.

`npm run check:ussd` drives the deployed function the way Africa's Talking does and checks every screen. `npm run db:verify:ussd` checks the database rules.
