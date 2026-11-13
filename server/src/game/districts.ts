/**
 * Catálogo de bairros. Cada bairro é um tipo de sala; quando uma instância enche,
 * o matchmaking cria outra instância do mesmo bairro (sharding horizontal).
 *
 * Os obstáculos (retângulos x, y, w, h) são a geometria autoritativa: o servidor
 * envia-os ao cliente no WELCOME, por isso não há duplicação de dados de mapa.
 */
export type Rect = [x: number, y: number, w: number, h: number];

export interface District {
  id: string;
  name: string;
  width: number;
  height: number;
  spawn: { x: number; y: number; radius: number };
  obstacles: Rect[];
}

const DISTRICTS: Record<string, District> = {
  cidade_baixa: {
    id: "cidade_baixa",
    name: "Cidade Baixa",
    width: 2400,
    height: 1600,
    spawn: { x: 1200, y: 800, radius: 120 },
    obstacles: [
      [300, 250, 320, 220], // casa
      [800, 200, 260, 260], // casa
      [1600, 300, 380, 240], // mercado
      [400, 1100, 300, 260], // casa
      [1700, 1050, 340, 300], // escola
    ],
  },
  sao_joao: {
    id: "sao_joao",
    name: "São João",
    width: 2000,
    height: 2000,
    spawn: { x: 1000, y: 1000, radius: 150 },
    obstacles: [
      [200, 200, 300, 300],
      [1400, 300, 300, 260],
      [500, 1400, 360, 240],
    ],
  },
};

export function getDistrict(id: string): District | undefined {
  return Object.hasOwn(DISTRICTS, id) ? DISTRICTS[id] : undefined;
}

export function listDistricts(): District[] {
  return Object.values(DISTRICTS);
}

export const DEFAULT_DISTRICT = "cidade_baixa";
