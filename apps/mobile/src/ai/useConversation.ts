import { useCallback, useRef, useState } from 'react';
import { ai, AiError, type AiErrorKind } from './client';

/**
 * A single conversation, held in memory only.
 *
 * Nothing here is written to disk. That is a decision, not an omission: these
 * turns contain a named child's grades and attendance, and persisting them
 * would spread that data into app storage, backups and any future sync — for
 * the sake of scrollback nobody asked for. Closing the screen forgets it.
 */

export interface AiMessage {
  id: string;
  author: 'user' | 'assistant';
  text: string;
  /** Present on assistant turns. */
  disclaimer?: string;
  failed?: boolean;
  errorKind?: AiErrorKind;
}

let counter = 0;
const nextId = () => `m${(counter += 1)}`;

export function useConversation(selectedChildId?: string | null) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; kind: AiErrorKind } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestion = useRef<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      lastQuestion.current = question;
      setError(null);
      setMessages((prev) => [...prev, { id: nextId(), author: 'user', text: question }]);
      setPending(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const reply = await ai.ask({
          message: question,
          selectedChildId: selectedChildId ?? null,
          signal: controller.signal,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            author: 'assistant',
            text: reply.reply,
            disclaimer: reply.disclaimer,
          },
        ]);
      } catch (caught) {
        if (controller.signal.aborted) return;
        const kind = caught instanceof AiError ? caught.kind : 'failed';
        const message =
          caught instanceof Error ? caught.message : 'The assistant could not answer that.';
        setError({ message, kind });
        // The question stays in the transcript so Retry has something to
        // resend and the user can see what failed.
        setMessages((prev) => [
          ...prev,
          { id: nextId(), author: 'assistant', text: message, failed: true, errorKind: kind },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pending, selectedChildId],
  );

  const retry = useCallback(() => {
    const question = lastQuestion.current;
    if (!question) return;
    // Drop the failed turn and its question before resending.
    setMessages((prev) => prev.slice(0, -2));
    void send(question);
  }, [send]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setPending(false);
    lastQuestion.current = null;
  }, []);

  return { messages, pending, error, send, retry, clear, canRetry: lastQuestion.current !== null };
}
