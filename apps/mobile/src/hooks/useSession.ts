import type {
  RegisterMadrasaInput,
  RegisterParentInput,
  Session,
  SignInInput,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { unregisterDeviceForPush } from '@/notifications/push';

/**
 * The session is a query rather than a store, so every screen shares one
 * source of truth and a sign-out invalidates the whole cache at once.
 */
export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: () => api.getSession(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** For screens that are already behind a guard and know a session exists. */
export function useRequiredSession(): Session {
  const { data } = useSession();
  if (!data) {
    throw new Error('useRequiredSession called outside an authenticated route');
  }
  return data;
}

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) => api.signIn(input),
    onSuccess: (session) => {
      client.setQueryData(qk.session, session);
      void client.invalidateQueries();
    },
  });
}

export function useRegisterMadrasa() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterMadrasaInput) => api.registerMadrasa(input),
    onSuccess: (session) => {
      client.setQueryData(qk.session, session);
      void client.invalidateQueries();
    },
  });
}

export function useRegisterParent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterParentInput) => api.registerParent(input),
    onSuccess: (session) => {
      client.setQueryData(qk.session, session);
      void client.invalidateQueries();
    },
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // While still signed in, so the server accepts it: this phone stops
      // receiving the account's notifications.
      await unregisterDeviceForPush();
      await api.signOut();
    },
    onSuccess: () => {
      client.setQueryData(qk.session, null);
      // Everything cached belonged to the account that just left.
      client.clear();
    },
  });
}
