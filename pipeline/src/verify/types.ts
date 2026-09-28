import type { VerifyVerdict } from '../types.js';

// the only bits of a job an adapter actually needs to check it
export interface JobRef {
  id: string;
  url: string;
  title: string;
  company: string;
}

export type Tier = 'T1' | 'T2' | 'T3';

export interface Adapter {
  name: string;
  tier: Tier;
  // does this adapter know how to handle this apply link?
  match(url: URL): boolean;
  // some job boards let us ask about a whole company in one request instead of one
  // request per role. if so, return a key here and the dispatcher groups the roles
  // by it and calls verifyBoard once per group. that's how ~195 roles turn into
  // ~109 requests rather than 195.
  boardKey?(url: URL): string | undefined;
  verifyBoard?(boardKey: string, jobs: JobRef[]): Promise<Map<string, VerifyVerdict>>;
  // for boards where we have to check one role at a time
  verifyOne?(job: JobRef): Promise<VerifyVerdict>;
}

export function unknown(by: string, reason: string): VerifyVerdict {
  return { status: 'unverified', by, reason };
}

// takes an options object rather than a pile of optional positional arguments,
// because there are three of them now and open(NAME, undefined, undefined, text)
// is unreadable
export interface OpenDetails {
  publishedAt?: string | undefined;
  description?: string | undefined;
  reason?: string | undefined;
}

export function open(by: string, details: OpenDetails = {}): VerifyVerdict {
  const v: VerifyVerdict = { status: 'open', by };
  if (details.publishedAt) v.publishedAt = details.publishedAt;
  if (details.description) v.description = details.description;
  if (details.reason) v.reason = details.reason;
  return v;
}

export function closed(by: string, reason: string): VerifyVerdict {
  return { status: 'closed', by, reason };
}
