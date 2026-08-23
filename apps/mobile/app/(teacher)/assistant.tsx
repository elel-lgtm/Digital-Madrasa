import { AiChatScreen } from '@/components/ai/AiChatScreen';

/**
 * The assistant is one screen shared by every role. What differs — the tone,
 * the suggested prompts, and above all which students are in scope — is
 * decided by the gateway from the caller's token, not here.
 */
export default function Assistant() {
  return <AiChatScreen />;
}
