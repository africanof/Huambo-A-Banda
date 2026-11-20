/** Caixa de SMS de quem está desligado: entregue quando voltar a entrar (memória do processo). */
const inbox = new Map<string, Array<{ from: string; text: string; at: number }>>();

export function queueSms(toCharacterId: string, from: string, text: string, at = Date.now()): void {
  const box = inbox.get(toCharacterId) ?? [];
  box.push({ from, text, at });
  inbox.set(toCharacterId, box.slice(-20));
}

export function takeSms(characterId: string): Array<{ from: string; text: string; at: number }> {
  const box = inbox.get(characterId) ?? [];
  inbox.delete(characterId);
  return box;
}
