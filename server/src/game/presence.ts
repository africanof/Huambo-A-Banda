/** Onde está cada personagem ligada agora (bairro e sala) — para a lista de Amigos. Memória do processo. */
export interface Where {
  name: string;
  district: string;
  districtName: string;
  roomId: string;
  since: number;
}
const online = new Map<string, Where>();

export function setOnline(characterId: string, w: Where): void {
  online.set(characterId, w);
}
export function setOffline(characterId: string, roomId: string): void {
  // só apaga se ainda estiver registado nesta sala (mudou de sala: a nova já escreveu por cima)
  if (online.get(characterId)?.roomId === roomId) online.delete(characterId);
}
export function whereIs(characterId: string): Where | undefined {
  return online.get(characterId);
}
export function resetPresence(): void {
  online.clear();
}
