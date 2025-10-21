## WhatsApp Coach API

Minimal Express + TypeScript service integrating Twilio WhatsApp, OpenAI, and Supabase.

### Prerequisites
- Node.js 18+
- Twilio account with a WhatsApp-enabled number
- OpenAI API key
- Supabase project (URL + anon key)

### Setup
1. Install dependencies:
```bash
npm install
```
2. Create an `.env` file from `env.example` and fill in your values.
3. Create the database schema in Supabase using `database_schema.sql`.

### Run the app
- `npm run dev` – Start dev server with autoreload
- `npm run build` – Type-check and compile to `dist/`
- `npm start` – Run compiled server


### Expose Local App via Ngrok

If your app is running locally (e.g., on **[http://localhost:5000](http://localhost:5000)**), you can use **ngrok** to make it publicly accessible for Twilio’s webhooks.

#### 1. Connect Your ngrok Account (First Time Only) - For Windows

Sign up on [ngrok.com](https://ngrok.com/) and get your auth token. Thn open the terminal and run:

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

#### 2. Start ngrok on Port 5000

Run the following command:

```bash
ngrok http 5000
```

You’ll see output similar to:

```
Forwarding    https://abcd1234.ngrok.io -> http://localhost:5000
```

Copy the **public HTTPS URL** (e.g., `https://abcd1234.ngrok.io`).

#### 3. Add Public URL to Twilio Sandbox

Go to your [Twilio Sandbox for WhatsApp](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn).

In the sandbox settings **“WHEN A MESSAGE COMES IN”** field, enter your ngrok URL followed by the appropriate endpoint, for example:

```
https://abcd1234.ngrok.io/webhook
```

Save the settings.

#### 4. Test

Send a message to your Twilio Sandbox number.
You should see the request appear in your local app logs.



# behavior-coach-freddie-
