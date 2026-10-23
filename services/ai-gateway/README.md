# AI gateway (optional)

A role-aware AI gateway that can sit between the mobile app and a self-hosted model (Ollama). It never holds a privileged database key: it answers using the caller's own session, so it can only see what that user may see. Pupils' names are replaced with "Student A", "Student B" before any data reaches the model, and mapped back afterwards.

The app does not need it. By default the assistant runs as the hosted `ai-assistant` Edge Function; set `EXPO_PUBLIC_AI_GATEWAY_URL` in the app only to use this gateway instead.

```bash
npm run dev       # start with file watching
npm run start     # start
```

`src/verify.ts` checks that every number in the model's answer appears in the data it was given; an answer that fails is replaced by a plain summary built from the data. Its tests are in `src/verify.test.ts`.
