import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as api from '../api';

export function useAgents() {
  return useQuery({ queryKey: ['agents'], queryFn: api.fetchAgents });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agent', id],
    queryFn: () => api.fetchAgent(id),
    enabled: !!id,
  });
}

export function useSkills() {
  return useQuery({ queryKey: ['skills'], queryFn: api.fetchSkills });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createAgent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useStartAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.startAgent,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agent', id] });
    },
  });
}

export function useStopAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.stopAgent,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agent', id] });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAgent,
    onSuccess: () => invalidateAfterAgentDelete(qc),
  });
}

export async function invalidateAfterAgentDelete(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['agents'] }),
    qc.invalidateQueries({ queryKey: ['walletBalance'] }),
  ]);
}
