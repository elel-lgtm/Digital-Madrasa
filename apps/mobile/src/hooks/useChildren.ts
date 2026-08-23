import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { useActiveChild } from '@/store/activeChild';

/**
 * The parent's approved children plus the currently selected one. Keeps the
 * stored selection honest: if a link is revoked, the selection falls back to
 * the first remaining child instead of pointing at a record we can't read.
 */
export function useChildren() {
  const studentId = useActiveChild((s) => s.studentId);
  const setStudentId = useActiveChild((s) => s.setStudentId);

  const children = useQuery({ queryKey: qk.children(), queryFn: () => api.listChildren() });

  useEffect(() => {
    const list = children.data;
    if (!list) return;
    if (list.length === 0) {
      if (studentId !== null) setStudentId(null);
      return;
    }
    if (!studentId || !list.some((child) => child.id === studentId)) {
      setStudentId(list[0]!.id);
    }
  }, [children.data, studentId, setStudentId]);

  const activeId =
    studentId && children.data?.some((c) => c.id === studentId)
      ? studentId
      : (children.data?.[0]?.id ?? null);

  return {
    children: children.data ?? [],
    activeId,
    setActiveId: setStudentId,
    isPending: children.isPending,
    isError: children.isError,
    error: children.error,
    refetch: children.refetch,
    isFetching: children.isFetching,
  };
}
