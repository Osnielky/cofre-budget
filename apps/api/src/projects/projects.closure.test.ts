import { describe, it, expect, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { ProjectsService } from './projects.service';

const USER_ID = 'user-1';

let ds: DataSource;
let service: ProjectsService;

beforeEach(async () => {
  ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    entities: [User, Project, ProjectCategory, Transaction, Category, BankAccount, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  const userRepo = ds.getRepository(User);
  await userRepo.save(userRepo.create({ id: USER_ID, email: 'a@b.c', name: 'A', password: 'x' }));
  service = new ProjectsService(
    ds.getRepository(Project),
    ds.getRepository(ProjectCategory),
    ds.getRepository(Transaction),
  );
});

async function makeProject(type: string, over: Partial<Project> = {}) {
  const repo = ds.getRepository(Project);
  return repo.save(repo.create({
    userId: USER_ID, name: `${type} project`, type, icon: '📦', purchasePrice: 0, status: 'active', ...over,
  }));
}

describe('ProjectsService.update — closure rules', () => {
  it('lets a vehicle be sold', async () => {
    const p = await makeProject('vehicle');
    const out = await service.update(p.id, USER_ID, { status: 'sold', salePrice: 5000, saleDate: '2026-09-01' });
    expect(out.status).toBe('sold');
  });

  it('lets a service be terminated', async () => {
    const p = await makeProject('service');
    const out = await service.update(p.id, USER_ID, { status: 'terminated', saleDate: '2026-09-01' });
    expect(out.status).toBe('terminated');
  });

  it('refuses to sell a service', async () => {
    // "Sold" is for held assets. A consulting business ends, it isn't sold here.
    const p = await makeProject('service');
    await expect(service.update(p.id, USER_ID, { status: 'sold', salePrice: 100 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to terminate a vehicle', async () => {
    const p = await makeProject('vehicle');
    await expect(service.update(p.id, USER_ID, { status: 'terminated' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a status that is not one of the three', async () => {
    const p = await makeProject('vehicle');
    await expect(service.update(p.id, USER_ID, { status: 'archived' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('reactivates a sold project and clears its sale', async () => {
    const p = await makeProject('vehicle', { status: 'sold', salePrice: 5000, saleDate: '2026-09-01' });
    const out = await service.update(p.id, USER_ID, { status: 'active' });
    expect(out.status).toBe('active');
    // A revived project must not carry a stale sale price into its P&L.
    expect(out.salePrice).toBeNull();
    expect(out.saleDate).toBeNull();
    expect(out.netGain).toBeNull();
  });

  it('reactivates a terminated project', async () => {
    const p = await makeProject('trading', { status: 'terminated', saleDate: '2026-09-01' });
    const out = await service.update(p.id, USER_ID, { status: 'active' });
    expect(out.status).toBe('active');
    expect(out.saleDate).toBeNull();
  });

  it('never reads a termination date as a sale', async () => {
    const p = await makeProject('business', { status: 'terminated', saleDate: '2026-09-01' });
    const out = await service.update(p.id, USER_ID, {});
    expect(out.netGain).toBeNull();
  });

  it('leaves updates that do not touch status alone', async () => {
    const p = await makeProject('service');
    const out = await service.update(p.id, USER_ID, { name: 'Renamed' });
    expect(out.name).toBe('Renamed');
    expect(out.status).toBe('active');
  });
});
