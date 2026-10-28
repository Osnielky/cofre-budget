import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { PlaidItem } from './plaid-item.entity';
import { PlaidService } from './plaid.service';

/** An item counts as stale once its last successful sync is older than this. Plaid
 *  refreshes most US banks at least daily, so a healthy item never reaches it. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** How often an awake API instance re-checks for stale items. */
const SWEEP_EVERY_MS = 60 * 60 * 1000;
/** Boot delay so migrations and the first requests settle before Plaid calls start. */
const BOOT_DELAY_MS = 30 * 1000;

export interface SweepResult {
  /** Items that were stale when the sweep started. */
  stale: number;
  /** Items the sweep handed to the sync. */
  synced: number;
  /** Items whose sync threw before Plaid was reached (bad token, DB error). */
  failed: number;
  /** Items that another trigger (webhook, user click) refreshed while the sweep ran. */
  skipped: number;
}

/**
 * Safety floor under Plaid's webhooks. Automatic sync is webhook-driven, so an item
 * whose webhook was lost (Plaid outage, deploy at the wrong second, instance scaled
 * to zero) would stay stale until the user pressed Sync. This sweep resyncs every
 * active item not synced in the last 24 hours. It runs at boot and hourly while an
 * instance is awake, and `POST /api/plaid/sweep` lets Cloud Scheduler force it on a
 * schedule even when Cloud Run has scaled to zero (docs/deployment.md).
 *
 * Items in 'error' are left alone: the user has to reconnect them, and hammering
 * Plaid with a dead token helps nobody.
 */
@Injectable()
export class PlaidSweepService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlaidSweepService.name);
  private running = false;

  constructor(
    @InjectRepository(PlaidItem) private items: Repository<PlaidItem>,
    private plaid: PlaidService,
    private config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('PLAID_SWEEP_DISABLED') === 'true') return;
    setTimeout(() => void this.sweepStale(), BOOT_DELAY_MS).unref();
    setInterval(() => void this.sweepStale(), SWEEP_EVERY_MS).unref();
  }

  /** Active items last synced before `now - STALE_AFTER_MS` (or never). */
  findStale(now: Date = new Date()): Promise<PlaidItem[]> {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
    return this.items.find({
      where: [
        { status: 'active', lastSync: IsNull() },
        { status: 'active', lastSync: LessThan(cutoff) },
      ],
      order: { lastSync: 'ASC' },
    });
  }

  /** Sync every stale item, one at a time. Never throws; a bad item is counted and the
   *  rest still run. Re-reads each item right before syncing so one refreshed by a
   *  webhook or a user click in the meantime is skipped — Cloud Run may run two
   *  instances, and both sweeping the same item would collide on the transaction index. */
  async sweepStale(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { stale: 0, synced: 0, failed: 0, skipped: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const stale = await this.findStale(now);
      result.stale = stale.length;
      const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
      for (const item of stale) {
        const fresh = await this.items.findOneBy({ id: item.id });
        if (!fresh || fresh.status !== 'active' || (fresh.lastSync && fresh.lastSync > cutoff)) {
          result.skipped++;
          continue;
        }
        try {
          await this.plaid.syncByExternalItemId(item.itemId);
          result.synced++;
        } catch (err) {
          result.failed++;
          this.logger.warn(`Stale sync failed for item ${item.itemId}: ${(err as Error).message}`);
        }
      }
      if (result.stale > 0) {
        this.logger.log(`Stale-item sweep: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed of ${result.stale}`);
      }
    } catch (err) {
      this.logger.warn(`Stale-item sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
    return result;
  }
}
