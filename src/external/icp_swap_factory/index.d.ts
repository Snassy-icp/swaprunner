import { HttpAgent, Actor } from "@dfinity/agent";

export const idlFactory: any;
export const canisterId: string;
export function createActor(canisterId: string, options?: {
  agent?: HttpAgent;
  agentOptions?: Record<string, unknown>;
  actorOptions?: Record<string, unknown>;
}): Actor; 