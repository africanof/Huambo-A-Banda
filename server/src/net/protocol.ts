import { z } from "zod";

/**
 * Protocolo de aplicação do Huambo É A Banda.
 *
 * Fonte de verdade: este ficheiro. O espelho em GDScript está em
 * client/src/net/protocol.gd e um teste (test/protocol-sync.test.ts) garante que
 * os dois ficam iguais.
 *
 * Decisões:
 *  - Tipos de mensagem numéricos (1 byte em msgpack) em vez de strings: os
 *    snapshots saem 10x/s para cada jogador, cada byte conta em redes móveis.
 *  - Posições em píxeis inteiros e entidades em arrays planos.
 *  - O cliente só envia INTENÇÕES (ex.: "quero andar para X"). O servidor decide.
 */
export const PROTOCOL_VERSION = 2;

/** Cliente -> Servidor */
export const C2S = {
  MOVE_TO: 1,
  STOP: 2,
  /** caminho calculado pelo cliente: o servidor valida cada segmento */
  MOVE_PATH: 3,
  /** direção contínua (joystick / teclado) */
  MOVE_DIR: 4,
  /** ação de vida: comer, trabalhar, estudar, dormir, emprego, pais… */
  ACTION: 5,
  /** conversa: quem está perto ouve */
  CHAT: 6,
  /** gesto (acenar, dançar…) */
  EMOTE: 7,
  /** dedicatória na rádio do bairro (paga) */
  RADIO: 8,
} as const;

/** Servidor -> Cliente */
export const S2C = {
  WELCOME: 100,
  SPAWN: 101,
  DESPAWN: 102,
  SNAPSHOT: 103,
  NOTICE: 104,
  /** o meu estado: dinheiro, necessidades, emprego, ação em curso */
  SELF: 105,
  /** aviso curto para o jogador */
  TOAST: 106,
  /** alguém perto falou: { id, n, t } */
  CHAT: 107,
  /** alguém perto fez um gesto: { id, e } */
  EMOTE: 108,
  /** dedicatória na rádio: { n, t } (todo o bairro ouve) */
  RADIO: 109,
  /** alguém mudou de roupa: { id, a } (aparência nova) */
  APPEARANCE: 110,
  /** SMS de um amigo: { n, t } */
  SMS: 111,
} as const;

/** Códigos de erro de aplicação (enviados em NOTICE ou como motivo de recusa). */
export const ErrorCodes = {
  PROTOCOL_MISMATCH: 4001,
  INVALID_DISTRICT: 4002,
  DUPLICATE_SESSION: 4003,
  RATE_LIMITED: 4004,
  SERVER_SHUTDOWN: 4005,
} as const;

// ---------- Validação de entradas do cliente (nunca confiar no cliente) ----------

// interiores ficam a ~1 km da rua (y ≈ 100 000 cm): margem até 10 km
const coord = z.number().finite().min(-1_000_000).max(1_000_000);

export const ChatSchema = z.object({ t: z.string().min(1).max(400), g: z.boolean().optional() }).strict();
export const EmoteSchema = z.object({ e: z.enum(["acenar", "dancar", "aplaudir", "rir", "celebrar", "resmungar"]) }).strict();

export const MoveToSchema = z.object({ x: coord, y: coord }).strict();
export type MoveTo = z.infer<typeof MoveToSchema>;

export const MovePathSchema = z
  .object({ p: z.array(coord).min(2).max(48).refine((a) => a.length % 2 === 0, "pares x,y") })
  .strict();

export const MoveDirSchema = z
  .object({ x: z.number().int().min(-100).max(100), y: z.number().int().min(-100).max(100) })
  .strict();

export const ActionSchema = z
  .object({
    a: z.enum([
      "self",
      "eat",
      "work",
      "study",
      "sleep",
      "sleep_rua",
      "cancel",
      "take_job",
      "quit_job",
      "parents",
      // Fase B: entrar/sair dos edifícios, casas, banco e balcões de serviço
      "enter",
      "exit",
      "buy_house",
      "rent_house",
      "bank_in",
      "bank_out",
      "service",
      "home_eat",
      // viajar para outro bairro (candongueiro, autocarro, carro…)
      "travel",
      "buy_car",
      // missões do dia: recolher o prémio (n = 1..3)
      "mission_claim",
      // sorte do dia (grátis, uma vez por dia) e transferir dinheiro a alguém perto (i = id da pessoa, n = quantia)
      "sorte",
      "transfer",
      // biscatos, câmbio, rádio, amigos e grupos
      "biscato",
      "cambio_compra",
      "cambio_venda",
      "radio_ouvir",
      "amigo_pedir",
      "amigo_aceitar",
      "amigo_recusar",
      "amigo_remover",
      "grupo_criar",
      "grupo_entrar",
      "grupo_sair",
      // lavras e ambição de vida
      "lavra_semear",
      "lavra_regar",
      "lavra_colher",
      "lavra_vender",
      "ambicao_escolher",
      "ambicao_recolher",
      // namoro, casamento, negócios e imóveis
      "namoro_pedir",
      "namoro_aceitar",
      "namoro_recusar",
      "casar",
      "casar_aceitar",
      "casar_recusar",
      "terminar",
      "negocio_abrir",
      "negocio_recolher",
      "negocio_melhorar",
      "negocio_vender",
      "imoveis",
      // universidade e Muxima
      "uni_curso",
      // roupa e SMS
      "roupa_comprar",
      "roupa_vestir",
      "sms",
      "conquistas_recolher",
      "muxima_publicar",
      "muxima_gosto",
    ]),
    i: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
    /** quantia (banco) ou dias (renda) */
    n: z.number().int().min(1).max(1_000_000_000).optional(),
    /** texto livre curto (nome de grupo, id de grupo) — o servidor limpa */
    s: z.string().min(1).max(160).optional(),
    /** meio de transporte (viagens) */
    t: z.enum(["autocarro", "candongueiro", "kupapata", "taxi", "carro"]).optional(),
  })
  .strict();
export type ActionMessage = z.infer<typeof ActionSchema>;

export const AppearanceSchema = z
  .object({
    body: z.number().int().min(0).max(5),
    shirt: z.number().int().min(0).max(9),
    hair: z.number().int().min(0).max(5).default(0),
    pants: z.number().int().min(0).max(5).default(0),
    /** modelo HD: 0 = homem, 1 = mulher */
    model: z.number().int().min(0).max(1).default(0),
    /** cor da peça de cima (matiz 0..359); -1 = original */
    top: z.number().int().min(-1).max(359).default(-1),
  })
  .strip();

export const JoinOptionsSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    district: z.string().regex(/^[a-z0-9_]{2,32}$/),
    /** bairro onde aparecer; omitido = continuar onde estava */
    spawn: z.string().regex(/^[a-z0-9_]{2,32}$/).optional(),
  })
  .strip();
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

// ---------- Formatos de saída (documentação + tipos) ----------

export interface Appearance {
  body: number; // tom de pele
  shirt: number; // cor da camisola
  hair?: number; // cor do cabelo
  pants?: number; // cor das calças
  model?: number; // 0 homem, 1 mulher (personagens HD)
  top?: number; // matiz da peça de cima, -1 original
}

/** [id, nome, x, y, aparência] */
export type SpawnEntry = [number, string, number, number, Appearance];

export interface WelcomeMessage {
  selfId: number;
  district: {
    id: string;
    name: string;
    width: number;
    height: number;
    obstacles: Array<[number, number, number, number]>;
    /** mapa de grelha que o cliente carrega localmente (id + versão têm de coincidir) */
    map?: { id: string; version: string };
    bairros: Array<{ id: string; name: string }>;
  };
  speed: number;
  /** catálogo de empregos, ementas e preços (bairros com sistema de vida) */
  catalog?: unknown;
  simHz: number;
  snapshotHz: number;
  serverTime: number;
}

/** Snapshot: { t: ms do servidor, e: [id, x, y, id, x, y, ...] } apenas entidades dentro da área de interesse. */
export interface SnapshotMessage {
  t: number;
  e: number[];
}
