import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import type { Identity } from "../auth/TokenVerifier.js";
import { getDistrict, type District } from "../game/districts.js";
import { randomSpawn, sanitizeTarget, step, isWalkable, validatePath, type Mover } from "../game/movement.js";
import { SpatialGrid } from "../game/SpatialGrid.js";
import { GameLoop } from "../game/GameLoop.js";
import { LifeController, lifeCatalog } from "../game/LifeController.js";
import { markPlayedToday } from "../game/stats.js";
import { BurstLimiter, HEAR_RADIUS_CM, sanitizeChat } from "../game/social.js";
import { setOffline, setOnline } from "../game/presence.js";
import {
  C2S,
  ErrorCodes,
  JoinOptionsSchema,
  MoveToSchema,
  MovePathSchema,
  MoveDirSchema,
  ActionSchema,
  ChatSchema,
  EmoteSchema,
  PROTOCOL_VERSION,
  S2C,
  type Appearance,
  type SnapshotMessage,
  type SpawnEntry,
  type WelcomeMessage,
} from "../net/protocol.js";
import type { PositionUpdate } from "../persistence/index.js";
import { services } from "../services.js";
import { log } from "../utils/logger.js";

/** Estado de um jogador dentro da sala. Fica no servidor; o cliente só vê o que o AOI deixa. */
interface Player extends Mover {
  eid: number;
  sessionId: string;
  userId: string;
  characterId: string;
  name: string;
  appearance: Appearance;
  /** Entidades que este jogador conhece (já recebeu SPAWN). */
  known: Set<number>;
  dirtyPersist: boolean;
}

type DistrictClient = Client<{ userData: { eid: number }; auth: Identity }>;

const AOI_CELL = 400;
const AOI_RADIUS_CELLS = 2;
const KICK_CHANNEL = "huambo:kick-user";
const GROUP_CHANNEL = "huambo:group-chat";

export class DistrictRoom extends Room {
  // Proteção anti-flood nativa do Colyseus: acima disto o cliente é desligado.
  override maxMessagesPerSecond = 20;

  private district!: District;
  private loop!: GameLoop;
  private life?: LifeController;
  private readonly chatLimiter = new BurstLimiter(5, 10_000);
  private readonly emoteLimiter = new BurstLimiter(3, 6_000);
  private readonly radioLimiter = new BurstLimiter(1, 120_000);

  /** Mensagem do grupo vinda de qualquer sala: entrega aos membros que estão nesta. */
  private readonly onGroupMessage = (m: { gid: string; gname: string; id: number; n: string; t: string }): void => {
    if (!this.life) return;
    for (const client of this.clients as unknown as DistrictClient[]) {
      const q = this.playerOf(client);
      if (q && this.life.groupOf(q)?.id === m.gid) client.send(S2C.CHAT, { id: -1, n: `[${m.gname}] ${m.n}`, t: m.t, g: true });
    }
  };
  private lifeTimer: NodeJS.Timeout | undefined;
  private persistTimer: NodeJS.Timeout | undefined;
  private readonly players = new Map<number, Player>();
  private readonly byUser = new Map<string, Player>();
  private grid = new SpatialGrid(AOI_CELL);
  private readonly movedThisWindow = new Set<number>();
  private readonly scratch = new Set<number>();
  private nextEid = 1;
  private readonly onKick = (payload: { userId: string; except: string }) => this.kickDuplicate(payload);

  /**
   * Corre no pedido HTTP de matchmaking, antes de qualquer lugar ser reservado.
   * O token chega no cabeçalho Authorization: Bearer <jwt>.
   */
  static override async onAuth(token: string, options: unknown, _ctx: AuthContext): Promise<Identity> {
    const opts = JoinOptionsSchema.safeParse(options);
    if (!opts.success) {
      const v = (options as { v?: unknown } | null)?.v;
      if (v !== PROTOCOL_VERSION) throw new ServerError(ErrorCodes.PROTOCOL_MISMATCH, `protocol ${PROTOCOL_VERSION} required`);
      throw new ServerError(ErrorCodes.INVALID_DISTRICT, "invalid join options");
    }
    if (!getDistrict(opts.data.district)) throw new ServerError(ErrorCodes.INVALID_DISTRICT, "unknown district");
    const identity = await services().verifier.verify(token);
    if (!identity) throw new ServerError(401, "invalid token");
    return identity;
  }

  override onCreate(options: { district: string }): void {
    const district = getDistrict(options.district);
    if (!district) throw new ServerError(ErrorCodes.INVALID_DISTRICT, "unknown district");
    this.district = district;
    this.grid = new SpatialGrid(district.aoiCell ?? AOI_CELL);
    if (district.places?.length) {
      this.life = new LifeController(
        district,
        services().wallets,
        {
          self: (actor, state) => this.clientOf(actor as Player)?.send(S2C.SELF, state),
          toast: (actor, text, ok) => this.clientOf(actor as Player)?.send(S2C.TOAST, { t: text, ok }),
          // entrar/sair de um edifício: a posição saltou; para o movimento e atualiza a área de interesse
          moved: (actor) => {
            const p = actor as Player;
            p.tx = p.ty = null;
            p.path = undefined;
            p.dx = p.dy = 0;
            this.grid.upsert(p.eid, p.x, p.y);
            this.movedThisWindow.add(p.eid);
            p.dirtyPersist = true;
          },
        },
        Date.now,
        Math.random,
        { properties: services().properties, bank: services().bank, groups: services().groups },
      );
      this.lifeTimer = setInterval(() => void this.life?.tick().catch((err) => log().error({ err }, "life tick")), 250);
    }

    const { env } = services();
    this.maxClients = env.ROOM_MAX_CLIENTS;
    // Não usamos estado Schema: a replicação é feita por snapshots com AOI (ver docs/ARCHITECTURE.md).
    this.patchRate = null;
    this.setMetadata({ district: district.id });

    // Passo fixo (dt = 1/SIM_TICK_HZ): simulação determinística, igual à previsão do cliente.
    this.loop = new GameLoop(env.SIM_TICK_HZ, env.SNAPSHOT_HZ, (dt) => this.tick(dt), () => this.broadcastSnapshots());
    this.loop.start();
    this.persistTimer = setInterval(() => void this.flushPersistence(), env.PERSIST_INTERVAL_S * 1000);

    // Validação manual (safeParse): payloads inválidos são descartados sem
    // gerar stack traces — um cliente malicioso não consegue encher os logs.
    this.onMessage(C2S.MOVE_TO, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = MoveToSchema.safeParse(raw);
      if (!p || !msg.success) return;
      const target = sanitizeTarget(this.district, msg.data.x, msg.data.y);
      if (!target) return;
      p.tx = target.x;
      p.ty = target.y;
      p.path = undefined;
      p.dx = p.dy = 0;
    });

    // Caminho calculado pelo cliente (A*): cada segmento é validado aqui.
    this.onMessage(C2S.MOVE_PATH, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = MovePathSchema.safeParse(raw);
      if (!p || !msg.success) return;
      const ok = validatePath(this.district, p.x, p.y, msg.data.p);
      if (ok.length < 2) return;
      p.tx = ok[0]!;
      p.ty = ok[1]!;
      p.path = ok.slice(2);
      p.dx = p.dy = 0;
    });

    // Ações de vida (comer, trabalhar…): validadas e aplicadas pelo LifeController.
    this.onMessage(C2S.ACTION, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = ActionSchema.safeParse(raw);
      if (!p || !msg.success || !this.life) return;
      if (msg.data.a !== "self" && msg.data.a !== "cancel") {
        p.tx = p.ty = null;
        p.path = undefined;
        p.dx = p.dy = 0;
      }
      void this.life.handle(p, msg.data).catch((err) => log().error({ err }, "life action"));
    });

    // Joystick / teclado: direção contínua até nova ordem.
    this.onMessage(C2S.MOVE_DIR, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = MoveDirSchema.safeParse(raw);
      if (!p || !msg.success) return;
      p.dx = msg.data.x;
      p.dy = msg.data.y;
      p.tx = p.ty = null;
      p.path = undefined;
    });

    // Conversa e gestos: só ouve/vê quem está perto (15 m); texto limpo e com limite por pessoa.
    this.onMessage(C2S.CHAT, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = ChatSchema.safeParse(raw);
      if (!p || !msg.success) return;
      if (!this.chatLimiter.take(p.characterId)) {
        client.send(S2C.TOAST, { t: "Calma! Estás a falar depressa demais.", ok: false });
        return;
      }
      const text = sanitizeChat(msg.data.t);
      if (!text) return;
      if (msg.data.g) {
        // conversa do grupo: chega a todos os membros ligados, em qualquer bairro (via presença)
        const g = this.life?.groupOf(p);
        if (!g) {
          client.send(S2C.TOAST, { t: "Não estás em nenhum grupo.", ok: false });
          return;
        }
        void this.presence.publish(GROUP_CHANNEL, { gid: g.id, gname: g.name, id: p.eid, n: p.name, t: text });
        return;
      }
      const heard = this.sendNear(p, S2C.CHAT, { id: p.eid, n: p.name, t: text });
      if (heard > 0) this.life?.social(p, "conversar");
    });

    // Rádio do bairro: dedicatória paga que todos nesta sala ouvem (1 a cada 2 min por pessoa).
    this.onMessage(C2S.RADIO, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = ChatSchema.safeParse(raw);
      if (!p || !msg.success || !this.life) return;
      if (!this.radioLimiter.take(p.characterId)) {
        client.send(S2C.TOAST, { t: "A rádio só passa uma dedicatória tua a cada 2 minutos.", ok: false });
        return;
      }
      void this.life.radioDedication(p, msg.data.t).then((text) => {
        if (text) this.broadcast(S2C.RADIO, { n: p.name, t: text });
      });
    });

    this.onMessage(C2S.EMOTE, (client: DistrictClient, raw: unknown) => {
      const p = this.playerOf(client);
      const msg = EmoteSchema.safeParse(raw);
      if (!p || !msg.success || !this.emoteLimiter.take(p.characterId)) return;
      this.sendNear(p, S2C.EMOTE, { id: p.eid, e: msg.data.e });
    });

    this.onMessage(C2S.STOP, (client: DistrictClient) => {
      const p = this.playerOf(client);
      if (!p) return;
      p.tx = p.ty = null;
      p.path = undefined;
      p.dx = p.dy = 0;
    });

    void this.presence.subscribe(KICK_CHANNEL, this.onKick);
    void this.presence.subscribe(GROUP_CHANNEL, this.onGroupMessage);
    log().info({ roomId: this.roomId, district: district.id }, "district room created");
  }

  override onUnhandledMessage(client: DistrictClient, type: string | number): void {
    log().debug({ sessionId: client.sessionId, type }, "unhandled message");
  }

  override async onJoin(client: DistrictClient, options: { spawn?: string }, auth: Identity): Promise<void> {
    // Uma conta = uma sessão ativa no mundo inteiro (todas as salas, todos os processos).
    await this.presence.publish(KICK_CHANNEL, { userId: auth.userId, except: client.sessionId });

    const character = await services().characters.loadOrCreate(auth);

    const chosen = this.district.spawns.find((s) => s.id === options?.spawn);
    let pos = randomSpawn(this.district, chosen?.id);
    if (!chosen && character.district === this.district.id && character.x !== null && character.y !== null && isWalkable(this.district, character.x, character.y)) {
      pos = { x: character.x, y: character.y };
    }

    markPlayedToday(character.id);
    const eid = this.allocateEid();
    const player: Player = {
      eid,
      sessionId: client.sessionId,
      userId: auth.userId,
      characterId: character.id,
      name: character.name,
      appearance: character.appearance,
      x: pos.x,
      y: pos.y,
      tx: null,
      ty: null,
      dx: 0,
      dy: 0,
      known: new Set(),
      dirtyPersist: false,
    };
    client.userData = { eid };
    // Sessão antiga da mesma conta nesta sala: expulsa já (o aviso via presença
    // pode chegar depois, quando o mapa já aponta para a sessão nova).
    this.kickDuplicate({ userId: auth.userId, except: client.sessionId });
    this.players.set(eid, player);
    this.byUser.set(auth.userId, player);
    this.grid.upsert(eid, player.x, player.y);

    this.sendWelcome(client, player);
    setOnline(character.id, { name: character.name, district: this.district.id, districtName: this.district.name, roomId: this.roomId, since: Date.now() });
    await this.life?.join(player, character.life);
    log().info({ roomId: this.roomId, sessionId: client.sessionId, userId: auth.userId, eid }, "player joined");
  }

  override async onDrop(client: DistrictClient): Promise<void> {
    // Rede móvel instável: guarda o lugar durante 15 s antes de remover o jogador.
    const p = this.playerOf(client);
    if (p) {
      p.tx = p.ty = null;
      p.path = undefined;
      p.dx = p.dy = 0;
    }
    await this.allowReconnection(client, 15);
  }

  override onReconnect(client: DistrictClient): void {
    const p = this.playerOf(client);
    if (!p) return;
    p.known.clear();
    this.sendWelcome(client, p);
  }

  override async onLeave(client: DistrictClient): Promise<void> {
    const p = this.playerOf(client);
    if (!p) return;
    this.players.delete(p.eid);
    setOffline(p.characterId, this.roomId);
    const lifeState = this.life?.lifeOf(p);
    if (this.byUser.get(p.userId) === p) this.byUser.delete(p.userId);
    this.grid.remove(p.eid);
    this.movedThisWindow.delete(p.eid);
    // Os outros recebem DESPAWN no próximo snapshot porque o jogador já não está no AOI.
    await this.persist([p], lifeState);
    this.life?.leave(p);
    log().info({ roomId: this.roomId, sessionId: client.sessionId, eid: p.eid }, "player left");
  }

  override onBeforeShutdown(): void {
    this.broadcast(S2C.NOTICE, { code: ErrorCodes.SERVER_SHUTDOWN, msg: "server restarting" });
    void this.flushPersistence(true).finally(() => this.disconnect());
  }

  override async onDispose(): Promise<void> {
    this.loop?.stop();
    clearInterval(this.persistTimer);
    clearInterval(this.lifeTimer);
    await this.presence.unsubscribe(KICK_CHANNEL, this.onKick);
    await this.presence.unsubscribe(GROUP_CHANNEL, this.onGroupMessage);
    await this.flushPersistence(true);
  }

  // ---------------------------------------------------------------- simulação

  private tick(dt: number): void {
    for (const p of this.players.values()) {
      if (p.tx === null && !p.dx && !p.dy) continue;
      if (step(this.district, p, dt, this.district.speed)) {
        this.grid.upsert(p.eid, p.x, p.y);
        this.movedThisWindow.add(p.eid);
        p.dirtyPersist = true;
      }
    }
  }

  /**
   * Para cada jogador: calcula o conjunto visível (AOI), envia SPAWN/DESPAWN das
   * diferenças e um SNAPSHOT apenas com as entidades que se moveram.
   * Um jogador parado numa multidão parada não recebe nada.
   */
  private broadcastSnapshots(): void {
    const t = Math.round(this.loop.now());
    for (const client of this.clients as unknown as DistrictClient[]) {
      const me = this.playerOf(client);
      if (!me) continue;

      const visible = this.grid.query(me.x, me.y, AOI_RADIUS_CELLS, this.scratch);

      const despawn: number[] = [];
      for (const id of me.known) if (!visible.has(id)) despawn.push(id);
      for (const id of despawn) me.known.delete(id);

      const spawn: SpawnEntry[] = [];
      const moved: number[] = [];
      for (const id of visible) {
        const other = this.players.get(id);
        if (!other) continue;
        if (!me.known.has(id)) {
          me.known.add(id);
          spawn.push([id, other.name, Math.round(other.x), Math.round(other.y), other.appearance]);
        } else if (this.movedThisWindow.has(id)) {
          moved.push(id, Math.round(other.x), Math.round(other.y));
        }
      }

      if (despawn.length) client.send(S2C.DESPAWN, despawn);
      if (spawn.length) client.send(S2C.SPAWN, spawn);
      if (moved.length) client.send(S2C.SNAPSHOT, { t, e: moved } satisfies SnapshotMessage);
    }
    this.movedThisWindow.clear();
  }

  // ---------------------------------------------------------------- auxiliares

  private sendWelcome(client: DistrictClient, p: Player): void {
    const { env } = services();
    const welcome: WelcomeMessage = {
      selfId: p.eid,
      district: {
        id: this.district.id,
        name: this.district.name,
        width: this.district.width,
        height: this.district.height,
        obstacles: this.district.obstacles,
        map: this.district.map,
        bairros: this.district.spawns.map((b) => ({ id: b.id, name: b.name })),
      },
      speed: this.district.speed,
      catalog: this.life ? lifeCatalog() : undefined,
      simHz: env.SIM_TICK_HZ,
      snapshotHz: env.SNAPSHOT_HZ,
      serverTime: Math.round(this.loop.now()),
    };
    client.send(S2C.WELCOME, welcome);
  }

  private clientOf(p: Player): DistrictClient | undefined {
    return this.clients.getById(p.sessionId) as DistrictClient | undefined;
  }

  /** Envia a quem está a até 15 m (e ao próprio). Devolve quantos OUTROS receberam. */
  private sendNear(from: Player, type: number, payload: unknown): number {
    let others = 0;
    for (const client of this.clients as unknown as DistrictClient[]) {
      const q = this.playerOf(client);
      if (!q) continue;
      if (q !== from && Math.hypot(q.x - from.x, q.y - from.y) > HEAR_RADIUS_CM) continue;
      client.send(type, payload);
      if (q !== from) others++;
    }
    return others;
  }

  private playerOf(client: DistrictClient): Player | undefined {
    const eid = client.userData?.eid;
    return eid === undefined ? undefined : this.players.get(eid);
  }

  private allocateEid(): number {
    do {
      this.nextEid = this.nextEid >= 0x7fffffff ? 1 : this.nextEid + 1;
    } while (this.players.has(this.nextEid));
    return this.nextEid;
  }

  private kickDuplicate({ userId, except }: { userId: string; except: string }): void {
    const p = this.byUser.get(userId);
    if (!p || p.sessionId === except) return;
    const client = this.clients.getById(p.sessionId);
    if (!client) return;
    log().warn({ roomId: this.roomId, userId }, "duplicate session, kicking older one");
    client.send(S2C.NOTICE, { code: ErrorCodes.DUPLICATE_SESSION, msg: "logged in elsewhere" });
    client.leave(ErrorCodes.DUPLICATE_SESSION);
  }

  private async flushPersistence(all = false): Promise<void> {
    const batch = [...this.players.values()].filter((p) => all || p.dirtyPersist || (this.life?.lifeOf(p) !== undefined && this.life.isBusy(p) === false));
    await this.persist(batch);
  }

  private async persist(players: Player[], leavingLife?: unknown): Promise<void> {
    if (players.length === 0) return;
    const updates: PositionUpdate[] = players.map((p) => {
      const life = leavingLife ?? (this.life?.takeDirty(p) ? this.life.lifeOf(p) : undefined);
      return { id: p.characterId, district: this.district.id, x: p.x, y: p.y, ...(life ? { life } : {}) };
    });
    for (const p of players) p.dirtyPersist = false;
    try {
      await services().characters.savePositions(updates);
    } catch (err) {
      for (const p of players) p.dirtyPersist = true; // tenta de novo no próximo ciclo
      log().error({ err, roomId: this.roomId }, "failed to persist positions");
    }
  }
}
