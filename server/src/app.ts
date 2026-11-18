import { Server, LocalPresence, LocalDriver, type Presence, type MatchMakerDriver } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import type { Env } from "./config/env.js";
import { TokenVerifier } from "./auth/TokenVerifier.js";
import { createRepositories, type CharacterRepository, type WalletRepository } from "./persistence/index.js";
import { DistrictRoom } from "./rooms/DistrictRoom.js";
import { registerRoutes } from "./http/routes.js";
import { setServices, type Services } from "./services.js";
import { log } from "./utils/logger.js";

export const ROOM_DISTRICT = "district";

export interface CreateServerOverrides {
  characters?: CharacterRepository;
  wallets?: WalletRepository;
}

/**
 * Monta o servidor de jogo. Separado do index.ts para que os testes de
 * integração consigam criar um servidor real numa porta aleatória.
 */
export function createGameServer(env: Env, overrides: CreateServerOverrides = {}): { server: Server; services: Services } {
  const svc: Services = {
    env,
    verifier: new TokenVerifier(env),
    ...(() => {
      const repos = createRepositories(env);
      return { characters: overrides.characters ?? repos.characters, wallets: overrides.wallets ?? repos.wallets };
    })(),
  };
  setServices(svc);

  // Com REDIS_URL, vários processos partilham presença e matchmaking (escala horizontal).
  let presence: Presence;
  let driver: MatchMakerDriver;
  if (env.REDIS_URL) {
    presence = new RedisPresence(env.REDIS_URL);
    driver = new RedisDriver(env.REDIS_URL);
    log().info("using Redis presence + driver");
  } else {
    presence = new LocalPresence();
    driver = new LocalDriver();
  }

  const server = new Server({
    greet: false,
    publicAddress: env.PUBLIC_ADDRESS,
    presence,
    driver,
    gracefullyShutdown: env.NODE_ENV !== "test",
    transport: new WebSocketTransport({
      pingInterval: 5000,
      pingMaxRetries: 3,
      maxPayload: 16 * 1024, // nenhuma mensagem legítima do cliente é maior que isto
    }),
    express: (app) => registerRoutes(app, svc),
  });

  // Uma instância por bairro; quando enche, o matchmaking cria outra do mesmo bairro.
  server
    .define(ROOM_DISTRICT, DistrictRoom)
    .filterBy(["district"])
    .sortBy({ clients: -1 }); // enche primeiro as salas mais cheias: bairros com vida

  return { server, services: svc };
}
