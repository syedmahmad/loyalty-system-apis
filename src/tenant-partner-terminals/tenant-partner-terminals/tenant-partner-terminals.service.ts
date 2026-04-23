import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantPartnerTerminal } from '../entities/tenant-partner-terminal.entity';
import { TenantPartnerIntegration } from 'src/tenant-integrations/entities/tenant-partner-integration.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateTenantPartnerTerminalDto } from '../dto/create-tenant-partner-terminal.dto';
import { UpdateTenantPartnerTerminalDto } from '../dto/update-tenant-partner-terminal.dto';
import { BulkCreateTerminalsDto } from '../dto/bulk-create-terminals.dto';

@Injectable()
export class TenantPartnerTerminalsService {
  constructor(
    @InjectRepository(TenantPartnerTerminal)
    private terminalRepo: Repository<TenantPartnerTerminal>,

    @InjectRepository(TenantPartnerIntegration)
    private tpiRepo: Repository<TenantPartnerIntegration>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findByIntegration(integrationId: number): Promise<TenantPartnerTerminal[]> {
    return this.terminalRepo.find({
      where: { tenant_partner_integration_id: integrationId },
      order: { created_at: 'ASC' },
    });
  }

  async findOne(id: number): Promise<TenantPartnerTerminal> {
    const record = await this.terminalRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Terminal #${id} not found`);
    return record;
  }

  async create(
    dto: CreateTenantPartnerTerminalDto,
    userUuid: string,
  ): Promise<TenantPartnerTerminal> {
    const user = await this.userRepo.findOne({ where: { uuid: userUuid } });
    if (!user) throw new BadRequestException('User not found against user-token');

    const tpi = await this.tpiRepo.findOne({
      where: { id: dto.tenant_partner_integration_id },
    });
    if (!tpi)
      throw new BadRequestException(
        `Tenant integration #${dto.tenant_partner_integration_id} not found`,
      );

    const existing = await this.terminalRepo.findOne({
      where: {
        tenant_partner_integration_id: dto.tenant_partner_integration_id,
        branch_id: dto.branch_id,
        terminal_id: dto.terminal_id,
      },
    });
    if (existing)
      throw new BadRequestException(
        `A terminal with Branch ID "${dto.branch_id}" and Terminal ID "${dto.terminal_id}" already exists for this integration`,
      );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const terminal = queryRunner.manager.create(TenantPartnerTerminal, {
        tenant_partner_integration_id: dto.tenant_partner_integration_id,
        branch_id: dto.branch_id,
        terminal_id: dto.terminal_id,
        label: dto.label,
        is_active: 1,
        created_by: user.id,
        updated_by: user.id,
      });
      const saved = await queryRunner.manager.save(terminal);
      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkCreate(
    dto: BulkCreateTerminalsDto,
    userUuid: string,
  ): Promise<{ created: number; skipped: number }> {
    const user = await this.userRepo.findOne({ where: { uuid: userUuid } });
    if (!user) throw new BadRequestException('User not found against user-token');

    const tpi = await this.tpiRepo.findOne({
      where: { id: dto.tenant_partner_integration_id },
    });
    if (!tpi)
      throw new BadRequestException(
        `Tenant integration #${dto.tenant_partner_integration_id} not found`,
      );

    // Fetch existing to avoid duplicate inserts
    const existing = await this.terminalRepo.find({
      where: { tenant_partner_integration_id: dto.tenant_partner_integration_id },
      select: ['branch_id', 'terminal_id'],
    });
    const existingSet = new Set(
      existing.map((t) => `${t.branch_id}::${t.terminal_id}`),
    );

    const toInsert = dto.terminals.filter(
      (t) => !existingSet.has(`${t.branch_id}::${t.terminal_id}`),
    );
    const skipped = dto.terminals.length - toInsert.length;

    if (toInsert.length === 0) {
      return { created: 0, skipped };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const entities = toInsert.map((t) =>
        queryRunner.manager.create(TenantPartnerTerminal, {
          tenant_partner_integration_id: dto.tenant_partner_integration_id,
          branch_id: t.branch_id,
          terminal_id: t.terminal_id,
          label: t.label,
          is_active: 1,
          created_by: user.id,
          updated_by: user.id,
        }),
      );
      await queryRunner.manager.save(entities);
      await queryRunner.commitTransaction();
      return { created: toInsert.length, skipped };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: number,
    dto: UpdateTenantPartnerTerminalDto,
    userUuid: string,
  ): Promise<TenantPartnerTerminal> {
    const user = await this.userRepo.findOne({ where: { uuid: userUuid } });
    if (!user) throw new BadRequestException('User not found against user-token');

    const record = await this.terminalRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Terminal #${id} not found`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(TenantPartnerTerminal, { id }, {
        ...(dto.branch_id !== undefined && { branch_id: dto.branch_id }),
        ...(dto.terminal_id !== undefined && { terminal_id: dto.terminal_id }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        updated_by: user.id,
      });
      await queryRunner.commitTransaction();
      return this.terminalRepo.findOne({ where: { id } });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, userUuid: string): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { uuid: userUuid } });
    if (!user) throw new BadRequestException('User not found against user-token');

    const record = await this.terminalRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Terminal #${id} not found`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(TenantPartnerTerminal, { id });
      await queryRunner.commitTransaction();
      return { message: 'Terminal removed successfully' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
