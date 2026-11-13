class_name Protocol
extends RefCounted
## Espelho de server/src/net/protocol.ts — NÃO editar só de um lado.
## O teste server/test/protocol-sync.test.ts falha se os valores divergirem.

const PROTOCOL_VERSION := 2

# Cliente -> Servidor
const C2S_MOVE_TO := 1
const C2S_STOP := 2
const C2S_MOVE_PATH := 3
const C2S_MOVE_DIR := 4

# Servidor -> Cliente
const S2C_WELCOME := 100
const S2C_SPAWN := 101
const S2C_DESPAWN := 102
const S2C_SNAPSHOT := 103
const S2C_NOTICE := 104

# Códigos de erro de aplicação
const ERR_PROTOCOL_MISMATCH := 4001
const ERR_INVALID_DISTRICT := 4002
const ERR_DUPLICATE_SESSION := 4003
const ERR_RATE_LIMITED := 4004
const ERR_SERVER_SHUTDOWN := 4005
