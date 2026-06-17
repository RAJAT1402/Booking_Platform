import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// All-or-nothing acquire: succeed only if every key is free or already held by
// this holder, then (re)set each with the given TTL. Returns 1 on success.
const ACQUIRE_LOCKS = `
for i = 1, #KEYS do
  local v = redis.call('GET', KEYS[i])
  if v and v ~= ARGV[1] then
    return 0
  end
end
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], ARGV[1], 'PX', ARGV[2])
end
return 1
`;

// Release only the keys still owned by this holder.
const RELEASE_LOCKS = `
for i = 1, #KEYS do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    redis.call('DEL', KEYS[i])
  end
end
return 1
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.client = new Redis(url, { maxRetriesPerRequest: 3 });
    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  private seatKey(showId: string, showSeatId: string): string {
    return `seatlock:${showId}:${showSeatId}`;
  }

  /**
   * Atomically acquire locks on all given seats for `holderId`.
   * Returns true only if every seat was free (or already held by this holder).
   */
  async acquireSeatLocks(
    showId: string,
    showSeatIds: string[],
    holderId: string,
    ttlMs: number,
  ): Promise<boolean> {
    if (showSeatIds.length === 0) return true;
    const keys = showSeatIds.map((id) => this.seatKey(showId, id));
    const result = await this.client.eval(
      ACQUIRE_LOCKS,
      keys.length,
      ...keys,
      holderId,
      String(ttlMs),
    );
    return result === 1;
  }

  /** Release locks the holder still owns; never touches another holder's lock. */
  async releaseSeatLocks(
    showId: string,
    showSeatIds: string[],
    holderId: string,
  ): Promise<void> {
    if (showSeatIds.length === 0) return;
    const keys = showSeatIds.map((id) => this.seatKey(showId, id));
    await this.client.eval(RELEASE_LOCKS, keys.length, ...keys, holderId);
  }

  /** Current holder for each seat (null where the lock is absent/expired). */
  async getSeatLockHolders(
    showId: string,
    showSeatIds: string[],
  ): Promise<(string | null)[]> {
    if (showSeatIds.length === 0) return [];
    const keys = showSeatIds.map((id) => this.seatKey(showId, id));
    return this.client.mget(...keys);
  }
}
