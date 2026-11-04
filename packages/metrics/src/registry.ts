import type { ProtocolPack } from './types.js';
import { UnknownProtocolError } from '@envio-dashboard-ai/core';

const packs = new Map<string, ProtocolPack>();
const aliasMap = new Map<string, string>(); // alias → canonical id

export function registerPack(pack: ProtocolPack): void {
  packs.set(pack.id, pack);
  for (const alias of pack.aliases) {
    aliasMap.set(alias.toLowerCase(), pack.id);
  }
  aliasMap.set(pack.id.toLowerCase(), pack.id);
}

export function resolveProtocol(query: string): ProtocolPack {
  const id = aliasMap.get(query.toLowerCase());
  if (!id) throw new UnknownProtocolError(query);
  const pack = packs.get(id);
  if (!pack) throw new UnknownProtocolError(query);
  return pack;
}

export function listProtocols(): ProtocolPack[] {
  return Array.from(packs.values());
}

export function getPack(id: string): ProtocolPack | undefined {
  return packs.get(id);
}
