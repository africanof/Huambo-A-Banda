#!/usr/bin/env python3
"""
Bairros reais da cidade do Huambo (nomes do OpenStreetMap / Nominatim) e o que cada kit de IA contém.
Gera tools/bairros/bairros.json. Cada bairro = 1 imagem (kit) com todos os edifícios + >100 objetos.
"""
import json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))

# id, nome, tipo (centro | periferia), especiais [(venue, letreiro)], igreja, cantina
B = [
    ("cidade_alta", "Cidade Alta", "nobre",
     [("governo", "Palácio do Governo Provincial do Huambo"), ("banco", "Banco BAI"), ("hotel", "Hotel Cidade Alta"), ("correios", "Correios da Cidade Alta"), ("tribunal", "Tribunal Provincial do Huambo")],
     "Sé Catedral de Nossa Senhora da Conceição", "Cantina Planalto", "Hospital Geral do Huambo"),
    ("bairro_academico", "Bairro Académico", "centro",
     [("escola", "Instituto Superior Politécnico do Huambo"), ("apartamentos", "Residência de Estudantes"), ("loja_telecom", "Cibercafé Académico"), ("discoteca", "Discoteca Universitária")],
     "Igreja Evangélica do Bairro Académico", "Cantina do Estudante", None),
    ("sao_pedro", "São Pedro", "centro", [("esquadra", "Esquadra Policial de São Pedro"), ("padaria", "Padaria São Pedro"), ("correios", "Correios de São Pedro")],
     "Igreja de São Pedro", "Cantina da Tia Joana", None),
    ("aviacao", "Aviação", "centro", [("hotel", "Hotel Aviação"), ("churrasqueira", "Churrasqueira do Aeroporto"), ("loja_telecom", "Loja de Telemóveis Aviação")],
     "Igreja Católica da Aviação", "Cantina do Piloto", None),
    ("bairro_militar", "Bairro Militar", "centro", [("esquadra", "Comando da Polícia do Bairro Militar"), ("saude", "Hospital Militar do Huambo"), ("padaria", "Padaria do Bairro Militar")],
     "Igreja Metodista do Bairro Militar", "Cantina do Quartel", None),
    ("benfica", "Benfica", "centro", [("discoteca", "Discoteca Benfica"), ("churrasqueira", "Churrasqueira Benfica"), ("banco", "Banco Sol Benfica")],
     "Igreja Católica do Benfica", "Cantina do Sr. Kalei", None),
    ("cacilhas", "Cacilhas", "centro", [("padaria", "Padaria Cacilhas"), ("hotel", "Hospedaria Cacilhas"), ("esquadra", "Esquadra Policial de Cacilhas")],
     "Igreja Adventista de Cacilhas", "Cantina da Mamã Rosa", None),
    ("canata", "Canata", "centro", [("churrasqueira", "Churrasqueira Canata"), ("loja_telecom", "Loja Unitel Canata"), ("discoteca", "Discoteca Canata")],
     "Igreja Evangélica de Canata", "Cantina do Kota Zé", None),
    ("sao_jose", "São José", "centro", [("escola", "Complexo Escolar São José de Cluny"), ("padaria", "Padaria São José"), ("banco", "Banco BFA São José")],
     "Igreja de São José", "Cantina São José", None),
    ("sao_joao", "São João", "centro", [("churrasqueira", "Churrasqueira São João"), ("hotel", "Pensão São João"), ("correios", "Correios de São João")],
     "Igreja de São João", "Cantina da Avó Maria", None),
    ("kapango", "Kapango", "centro", [("discoteca", "Discoteca Kapango"), ("padaria", "Padaria Kapango"), ("esquadra", "Esquadra Policial do Kapango")],
     "Igreja Católica do Kapango", "Cantina do Kapango", None),
    ("bomba_alta", "Bomba Alta", "periferia", [("padaria", "Padaria Bomba Alta"), ("churrasqueira", "Churrasqueira Bomba Alta")],
     "Igreja Adventista da Bomba Alta", "Cantina da Bomba Alta", None),
    ("cacoio", "Cacoio", "periferia", [("churrasqueira", "Churrasqueira Cacoio"), ("loja_telecom", "Quiosque Unitel Cacoio")],
     "Igreja Evangélica do Cacoio", "Cantina do Cacoio", None),
    ("cahumba", "Cahumba", "periferia", [("padaria", "Padaria Cahumba"), ("discoteca", "Discoteca Cahumba")],
     "Igreja Católica da Cahumba", "Cantina da Cahumba", None),
    ("cambiote", "Cambiote", "periferia", [("churrasqueira", "Churrasqueira Cambiote"), ("esquadra", "Posto Policial do Cambiote")],
     "Igreja Evangélica do Cambiote", "Cantina do Cambiote", None),
    ("chiva", "Chiva", "periferia", [("padaria", "Padaria Chiva"), ("loja_telecom", "Loja Movicel Chiva")],
     "Igreja Católica da Chiva", "Cantina da Chiva", None),
    ("lossambo", "Lossambo", "periferia", [("churrasqueira", "Churrasqueira Lossambo"), ("hotel", "Hospedaria Lossambo")],
     "Igreja Adventista do Lossambo", "Cantina do Lossambo", None),
    ("salucombo", "Salucombo", "periferia", [("padaria", "Padaria Salucombo"), ("discoteca", "Discoteca Salucombo")],
     "Igreja Evangélica do Salucombo", "Cantina do Salucombo", None),
    ("samutaca", "Samutaca", "periferia", [("churrasqueira", "Churrasqueira Samutaca"), ("esquadra", "Posto Policial da Samutaca")],
     "Igreja Católica da Samutaca", "Cantina da Samutaca", None),
    ("vila_graca", "Vila Graça", "periferia", [("padaria", "Padaria Vila Graça"), ("loja_telecom", "Loja Unitel Vila Graça")],
     "Igreja Evangélica da Vila Graça", "Cantina da Vila Graça", None),
    ("xipuli", "Xipuli", "periferia", [("churrasqueira", "Churrasqueira Xipuli"), ("discoteca", "Discoteca Xipuli")],
     "Igreja Católica do Xipuli", "Cantina do Xipuli", None),
]

JOBS = {"escola": "professor", "saude": "enfermeiro", "igreja": "catequista", "mercado": "vendedor_mercado", "cantina": "cozinheiro",
        "farmacia": "farmaceutico", "administracao": "funcionario_publico", "governo": "funcionario_publico", "banco": "caixa_banco",
        "hotel": "rececionista", "correios": "carteiro", "tribunal": "oficial_justica", "esquadra": "policia", "padaria": "padeiro",
        "churrasqueira": "grelhador", "discoteca": "barman", "loja_telecom": "vendedor_loja"}
SHOPS = {"mercado": "mercado", "cantina": "cantina", "padaria": "padaria", "churrasqueira": "churrasqueira", "hotel": "hotel"}

LOOK = {
    "venue": {
        "escola": "single-storey school building with a covered veranda and the Angolan flag on a pole",
        "saude": "white and light-blue health centre with a red cross",
        "igreja": "church with a bell tower and a cross",
        "mercado": "covered market hall with a zinc roof and fruit stalls inside",
        "cantina": "small grocery shop (cantina) with a hand-painted sign and soft-drink adverts",
        "farmacia": "small pharmacy with a green cross",
        "administracao": "small administration office with the Angolan flag",
        "governo": "large colonial-era government palace, pink and white, with arches and the Angolan flag",
        "banco": "two-storey bank branch with glass entrance",
        "hotel": "two- or three-storey hotel / guesthouse with balconies",
        "correios": "post office painted yellow and red",
        "tribunal": "courthouse with columns and a staircase",
        "esquadra": "police station painted blue and white",
        "padaria": "bakery with bread on display and a striped awning",
        "churrasqueira": "grill restaurant with plastic tables under a canopy and a charcoal grill",
        "discoteca": "night club with a neon sign and dark facade",
        "loja_telecom": "small mobile-phone and internet shop with operator adverts",
        "apartamentos": "four-storey apartment block with balconies and water tanks on the roof",
    },
    "houses": {
        "nobre": "elegant colonial villas (vivendas) with tile roofs, gardens, verandas and high walls",
        "centro": "cement-block and colonial-style family houses with zinc or tile roofs, painted walls and metal gates",
        "periferia": "modest adobe-brick and cement-block houses with corrugated zinc roofs held by stones, small yards with reed fences, a few unfinished houses",
    },
}


# preposição correta em português para cada bairro ("Escola Primária da Chiva", "do Lossambo"…)
PREP = {"cidade_alta": "da", "bairro_academico": "do", "sao_pedro": "de", "aviacao": "da", "bairro_militar": "do", "benfica": "do",
        "cacilhas": "de", "canata": "de", "sao_jose": "de", "sao_joao": "de", "kapango": "do", "bomba_alta": "da", "cacoio": "do",
        "cahumba": "da", "cambiote": "do", "chiva": "da", "lossambo": "do", "salucombo": "do", "samutaca": "da", "vila_graca": "da", "xipuli": "do"}


def build():
    out = []
    for bid, name, tipo, specials, igreja, cantina, saude in B:
        short = name
        p = PREP[bid]
        blds = [
            ("escola", f"Escola Primária {p} {name}"),
            ("saude", saude or f"Centro de Saúde {p} {name}"),
            ("igreja", igreja),
            ("mercado", f"Mercado {p} {name}"),
            ("cantina", cantina),
            ("farmacia", f"Farmácia {short}"),
            ("administracao", f"Administração {p} {name}"),
        ] + list(specials) + [("apartamentos", f"Prédio {short}")]
        houses = 7 if tipo != "periferia" else 9
        out.append({"id": bid, "name": name, "tipo": tipo, "buildings": blds, "houses": houses})
    json.dump({"bairros": out, "jobs": JOBS, "shops": SHOPS, "look": LOOK}, open(os.path.join(HERE, "bairros.json"), "w"), ensure_ascii=False, indent=1)
    return out


if __name__ == "__main__":
    print(len(build()), "bairros")
