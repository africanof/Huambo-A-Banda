class_name Palette
extends RefCounted
## Cores do Huambo, tiradas das fotografias de referência (Wikimedia Commons):
## terra vermelha do planalto, fachadas salmão/rosa-velho com remates creme,
## telha terracota, prédios de betão dos anos 60–70, jardins geométricos.

const GROUND := Color("b07852")          # terra vermelha seca
const GROUND_DARK := Color("9c6545")
const ASPHALT := Color("4e4c4e")
const ASPHALT_LINE := Color(0.93, 0.9, 0.82, 0.55)
const CURB := Color("cdaa82")            # passeio / berma de areia
const DIRT_ROAD := Color("a05838")
const RAIL_BED := Color("82706a")
const RAIL := Color("2d2622")
const SLEEPER := Color("5a4636")

const AREA := {
	"park": Color("68964c"), "grass": Color("809c52"), "pitch": Color("58964a"), "stadium": Color("968270"),
	"cemetery": Color("788c60"), "wood": Color("46763e"), "scrub": Color("8c8c56"), "water": Color("5a8caa"),
	"wetland": Color("788c56"), "parking": Color("96928c"), "railyard": Color("82706a"), "plaza": Color("d6c4a0"),
	"farmland": Color("968250"), "campus": Color("be9670"), "platform": Color("beb4a0"), "stream": Color("5a8caa"),
}

# Fachadas
const WALL_HOUSE: Array[Color] = [Color("ead6b4"), Color("e7a493"), Color("f0e2c8"), Color("e2be78"), Color("deb0a0"), Color("f2efe6"), Color("cfe0d4")]
const WALL_BLOCK: Array[Color] = [Color("c8c4bc"), Color("e7a493"), Color("d6cebe"), Color("b8b2a8")]
const WALL_COMMERCIAL: Array[Color] = [Color("e7a493"), Color("ecdec4"), Color("d2c8b4"), Color("e8c96a")]
# Telhados
const ROOF_TILE := Color("b8532f")
const ROOF_TILE_DARK := Color("963f22")
const ROOF_METAL := Color("9a9ea0")
const ROOF_FLAT := Color("b0aaa0")
const WINDOW := Color("2f3b46")
const WINDOW_LIT := Color("f2d27a")
const WATER_TANK := Color("2f3236")

## kind -> [parede, telhado]
const SPECIAL := {
	"cathedral": [Color("f4f0e6"), Color("c4623a")],
	"church": [Color("f4f0e6"), Color("c4623a")],
	"palace": [Color("e6a094"), Color("b8532f")],
	"government": [Color("de9684"), Color("6e7076")],
	"station": [Color("eedeb0"), Color("b8532f")],
	"market": [Color("e2d6be"), Color("8c9296")],
	"civic": [Color("e6aa96"), Color("b8532f")],
	"cinema": [Color("e29696"), Color("b0aaa0")],
	"hotel": [Color("ece6d6"), Color("b0aaa0")],
	"post": [Color("e7a096"), Color("b8532f")],
	"hospital": [Color("f0f0ec"), Color("b0aaa0")],
	"school": [Color("ecd6aa"), Color("b8532f")],
}

const TREE_SHADOW := Color(0, 0, 0, 0.22)
const LABEL := Color("fff6dc")
const LABEL_OUTLINE := Color("2a1d17")

# Personagens (índices guardados no servidor/Supabase)
const SKIN: Array[Color] = [Color("8d5524"), Color("c68642"), Color("e0ac69"), Color("5c3a1e"), Color("a0662f"), Color("3b2414")]
const HAIR: Array[Color] = [Color("1a1412"), Color("3b2414"), Color("6b3e1f"), Color("a0662f"), Color("d8c8a8"), Color("8a2a2a")]
const SHIRT: Array[Color] = [
	Color("e63946"), Color("f1c40f"), Color("2a9d8f"), Color("264653"), Color("e76f51"),
	Color("8e44ad"), Color("27ae60"), Color("2980b9"), Color("ecf0f1"), Color("111111"),
]
const PANTS: Array[Color] = [Color("2d3047"), Color("3c3c3c"), Color("6b5b45"), Color("1f4e79"), Color("8a7a5a"), Color("5a2e2e")]


static func pick(arr: Array, seed: int) -> Color:
	return arr[seed % arr.size()]
