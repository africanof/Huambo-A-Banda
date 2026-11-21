/** Caixa de SMS de quem está desligado: entregue quando voltar a entrar (memória do processo). */
const inbox = new Map<string, Array<{ from: string; text: string; at: number; fromId?: string }>>();

export function queueSms(toCharacterId: string, from: string, text: string, at = Date.now(), fromId?: string): void {
  const box = inbox.get(toCharacterId) ?? [];
  box.push({ from, text, at, fromId });
  inbox.set(toCharacterId, box.slice(-20));
}

export function takeSms(characterId: string): Array<{ from: string; text: string; at: number; fromId?: string }> {
  const box = inbox.get(characterId) ?? [];
  inbox.delete(characterId);
  return box;
}

/** Presentes à espera (bónus de humor), entregues quando a pessoa estiver numa sala do servidor. */
const gifts = new Map<string, Array<{ from: string; name: string; mood: number; fromId?: string }>>();

export function queueGift(toCharacterId: string, from: string, name: string, mood: number, fromId?: string): void {
  const box = gifts.get(toCharacterId) ?? [];
  box.push({ from, name, mood, fromId });
  gifts.set(toCharacterId, box.slice(-10));
}

export function takeGifts(characterId: string): Array<{ from: string; name: string; mood: number; fromId?: string }> {
  const box = gifts.get(characterId);
  if (!box) return [];
  gifts.delete(characterId);
  return box;
}
