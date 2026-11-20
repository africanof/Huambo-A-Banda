"""Plantas dos interiores: onde fica cada móvel em cada tipo de sala, arrumado como numa loja,
escritório, escola ou casa a sério.

Sala 7,5 × 7,5 m. Eixos: x cresce para a frente-direita, y para a frente-esquerda (como no jogo).
Paredes visíveis: x = 0 (fundo à esquerda) e y = 0 (fundo à direita, com a porta perto de x = 6,2).
Regras:
  - o que é alto (estantes, armários, frigoríficos, quadro) fica encostado às paredes do fundo;
  - a peça principal (balcão, secretária, altar…) fica atravessada na sala, paralela à parede da
    esquerda: o pessoal trabalha atrás (entre a parede e o balcão) e os clientes ficam à frente;
  - entrada (x ≥ 4,9 e y ≤ 2,7) e o canto da frente sempre livres;
  - o que é baixo (bancos, cadeiras de espera, mesas) fica à frente, em filas alinhadas;
  - plantas e caixotes nos cantos.
Cada linha: (nome da peça no kit, x, y) — x, y é o canto de trás da pegada. Uma peça com pegada
(0,8 × L) está «de lado» (comprida em y, virada para +x); com (L × 0,8) está virada para +y.
"""

PLANTAS = {
    # casa: cozinha na parede da esquerda, cama ao fundo à direita, sala de estar à frente
    "casa": [
        ("roupeiro", 0.2, 0.3), ("frigorifico", 0.2, 2.0), ("fogao", 0.2, 3.1), ("botija", 0.2, 4.3), ("tv", 0.2, 5.4),
        ("cama", 1.6, 0.2),
        ("tapete", 1.1, 5.2), ("sofa", 2.6, 4.9), ("poltrona", 4.0, 5.9),
        ("mesa_jantar", 4.0, 3.2),
        ("ventoinha", 6.5, 3.0), ("cesto", 6.5, 4.0), ("planta", 6.5, 5.0),
    ],
    # cantina: mercearia na parede, balcão atravessado, mesa dos clientes à frente
    "cantina": [
        ("prateleira", 0.2, 0.3), ("prateleira2", 0.2, 2.2), ("arroz", 0.2, 4.2), ("oleo", 0.2, 6.4),
        ("lixo", 1.4, 0.25),
        ("balcao", 2.6, 2.5),
        ("mesa", 4.6, 3.4), ("sacos", 4.6, 5.3), ("frigorifico", 6.5, 2.9),
    ],
    "padaria": [
        ("farinha", 0.2, 0.3), ("farinha2", 0.2, 1.4), ("forno", 0.2, 2.6), ("carrinho_pao", 0.2, 4.6),
        ("extintor", 1.4, 0.25), ("planta", 3.6, 0.25),
        ("balcao", 2.6, 2.5),
        ("cafe", 4.8, 4.4), ("vitrine_bolos", 6.5, 3.0),
    ],
    # hotel: quarto à esquerda (cama de casal e cama de solteiro), receção ao meio, bagagem junto à entrada
    "hotel": [
        ("cama_casal", 0.2, 0.3), ("mesa_cabeceira", 0.2, 2.9), ("cama", 0.2, 4.2), ("planta", 0.2, 6.2),
        ("mala", 2.6, 0.25), ("candeeiro", 3.6, 0.25),
        ("rececao", 2.6, 2.5),
        ("suporte_malas", 5.2, 3.2), ("carrinho", 6.4, 3.2), ("poltrona", 5.2, 5.0),
    ],
    "banco": [
        ("cofre", 0.2, 0.3), ("armario", 0.2, 1.6), ("secretaria", 0.25, 3.6),
        ("folhetos", 1.4, 0.25), ("atm", 2.4, 0.2), ("lixo", 3.4, 0.3),
        ("balcao_caixa", 2.6, 2.5),
        ("barreira", 4.8, 2.9), ("cadeiras", 6.4, 2.9), ("planta", 5.4, 6.4),
    ],
    "loja_telecom": [
        ("balcao_movicel", 0.2, 0.3), ("balcao_unitel", 0.25, 2.6), ("balcao_africell", 0.2, 5.1),
        ("computadores", 1.4, 0.2), ("cartoes_sim", 3.8, 0.2),
        ("balcao_telemoveis", 2.6, 2.5),
        ("banco", 5.0, 4.0), ("planta", 6.5, 3.0), ("lixo", 6.5, 4.4),
    ],
    "correios": [
        ("apartados", 0.2, 0.3), ("triagem", 0.25, 3.0), ("encomendas", 0.2, 5.5),
        ("marco_correio", 1.4, 0.25), ("balanca", 2.4, 0.25), ("lixo", 3.4, 0.3),
        ("balcao", 2.6, 2.5),
        ("mesa", 4.8, 3.0), ("banco_espera", 6.4, 3.0), ("planta", 5.0, 5.6),
    ],
    # administração / governo: atendimento ao público, cadeiras e banco de espera em fila
    "governo": [
        ("estante", 0.2, 0.3), ("secretaria", 0.25, 2.1), ("arquivo", 0.2, 6.2),
        ("bandeira", 1.4, 0.25), ("planta", 2.4, 0.25), ("lixo", 3.4, 0.3),
        ("balcao", 2.6, 2.6),
        ("cadeira", 5.0, 3.2), ("cadeira2", 5.0, 4.6), ("banco_espera", 6.4, 3.0),
    ],
    # tribunal: juiz ao fundo, mesas dos advogados à frente dele, público em filas
    "tribunal": [
        ("tribuna_juiz", 0.25, 1.8),
        ("planta", 1.4, 0.25), ("lixo", 2.4, 0.3),
        ("mesa_advogados", 2.6, 2.4), ("mesa_advogados2", 2.6, 4.6),
        ("cartorio", 4.4, 3.0), ("testemunhas", 6.4, 3.0),
        ("bancos_publico", 3.8, 5.0), ("bancos_publico2", 5.0, 5.0),
    ],
    # escola: quadro na parede, carteiras em filas viradas para o quadro, mesa do professor ao lado
    "escola": [
        ("estante", 0.2, 0.3), ("quadro", 0.2, 2.6), ("planta", 0.2, 6.2),
        ("globo", 1.4, 0.25), ("ventoinha", 2.4, 0.25), ("lixo", 3.4, 0.3),
        ("secretaria_prof", 1.6, 4.8),
        ("carteiras", 3.6, 2.4), ("carteiras2", 3.6, 4.4),
    ],
    # centro de saúde: consultório (secretária) e enfermaria (cama) separados; espera à frente
    "saude": [
        ("armario_medicamentos", 0.2, 0.3), ("consultorio", 0.25, 2.4), ("balanca", 0.2, 5.2),
        ("cama_hospital", 1.4, 0.2), ("soro", 3.6, 0.25),
        ("marquesa", 2.2, 5.6), ("cadeira_rodas", 4.6, 3.0), ("cadeiras_espera", 6.4, 3.0), ("planta", 5.4, 5.8),
    ],
    # igreja: órgão e altar na parede do fundo, bancos em filas virados para o altar
    "igreja": [
        ("orgao", 0.3, 0.3), ("altar", 0.3, 2.7), ("nossa_senhora", 0.3, 6.0),
        ("ambao", 2.4, 0.3), ("flores", 4.0, 0.3),
        ("bancos", 3.4, 2.4), ("bancos", 3.4, 4.9), ("bancos", 5.0, 2.9), ("bancos2", 5.0, 5.2),
    ],
    "mercado": [
        ("banca_peixe", 0.2, 0.3), ("banca_fruta", 0.25, 2.6),
        ("saco_feijao", 1.4, 0.25), ("cesto", 2.4, 0.25), ("bidao", 3.4, 0.25),
        ("banca_legumes", 2.6, 2.5),
        ("caixa", 4.8, 3.0), ("banca_panos", 6.4, 2.9), ("cesto_mandioca", 4.7, 5.4),
    ],
    "esquadra": [
        ("cela", 0.2, 0.3), ("secretaria", 0.25, 2.6), ("arquivo", 1.6, 0.25),
        ("extintor", 2.6, 0.25), ("planta", 3.6, 0.25),
        ("atendimento", 2.6, 2.4), ("banco_espera", 5.6, 3.3),
    ],
    "farmacia": [
        ("prateleira_bebe", 0.2, 0.3), ("prateleira", 0.25, 2.8), ("frigorifico_vacinas", 0.2, 4.4),
        ("tensao", 1.4, 0.25), ("lixo", 2.4, 0.3),
        ("balcao", 2.6, 2.5),
        ("vitrine", 4.8, 2.9), ("cadeira", 6.4, 3.0), ("planta", 6.4, 4.2),
    ],
    "churrasqueira": [
        ("frigorifico", 0.2, 0.3), ("grelha", 0.25, 2.2), ("ventoinha", 0.2, 5.4), ("planta", 1.4, 0.25),
        ("bar", 2.6, 2.0),
        ("mesa_vermelha", 4.6, 3.0), ("mesa_azul", 6.0, 3.0),
    ],
    # discoteca: DJ e colunas ao fundo, pista ao meio, bar à frente com bancos, sofá à esquerda
    "discoteca": [
        ("dj", 0.2, 0.4), ("coluna", 0.2, 3.3), ("coluna3", 0.2, 6.3),
        ("coluna2", 1.4, 0.25), ("luzes", 2.4, 0.25), ("planta", 3.4, 0.25),
        ("pista", 1.6, 2.4), ("bar", 3.9, 4.6), ("banco_bar", 5.0, 2.9),
        ("sofa", 1.2, 5.0),
    ],
}
# mesmas salas
PLANTAS["apartamentos"] = PLANTAS["casa"]
PLANTAS["administracao"] = PLANTAS["governo"]
PLANTAS["universidade"] = PLANTAS["escola"]
