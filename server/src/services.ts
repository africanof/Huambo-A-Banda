import type { Env } from "./config/env.js";
import type { TokenVerifier } from "./auth/TokenVerifier.js";
import type { CharacterRepository } from "./persistence/index.js";

/**
 * Contentor de dependências partilhadas pelas salas.
 * O Colyseus instancia as salas por si e o onAuth é estático, por isso
 * injetamos as dependências aqui no arranque (e nos testes).
 */
export interface Services {
  env: Env;
  verifier: TokenVerifier;
  characters: CharacterRepository;
}

let current: Services | undefined;

export function setServices(s: Services): void {
  current = s;
}

export function services(): Services {
  if (!current) throw new Error("services not initialized");
  return current;
}
