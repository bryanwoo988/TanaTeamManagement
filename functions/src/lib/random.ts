import { randomInt } from 'node:crypto';

const RANGE = 2 ** 47; // randomInt needs max < 2^48

/** A Math.random replacement from the OS CSPRNG: invite codes must not be predictable. */
export const secureRandom = (): number => randomInt(RANGE) / RANGE;
