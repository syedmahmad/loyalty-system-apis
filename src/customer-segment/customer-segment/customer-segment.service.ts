import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as fastcsv from 'fast-csv';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { CustomerSegment } from '../entities/customer-segment.entity';
import { CreateCustomerSegmentDto } from '../dto/create.dto';
import { UpdateCustomerSegmentDto } from '../dto/update-customer-segment.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { CustomerSegmentMember } from '../entities/customer-segment-member.entity';
import { encrypt } from 'src/helpers/encryption';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { CustomerService } from 'src/customers/customer.service';
import { OciService } from 'src/oci/oci.service';
import { WalletService } from 'src/wallet/wallet/wallet.service';

@Injectable()
export class CustomerSegmentsService {
  constructor(
    @InjectRepository(CustomerSegment)
    private readonly segmentRepository: Repository<CustomerSegment>,

    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,

    @InjectRepository(CustomerSegmentMember)
    private readonly memberRepository: Repository<CustomerSegmentMember>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,

    private readonly ociService: OciService,
    private readonly customerService: CustomerService,
    private readonly walletService: WalletService,
  ) {}

  async create(dto: CreateCustomerSegmentDto, user: string, permission: any) {
    if (!permission.canCreateCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to create customer segment",
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // const checkSegmentExist = await this.segmentRepository.findOne({
      //   where: { name: dto.name, status: 1 },
      // });

      // if (checkSegmentExist) {
      //   throw new BadRequestException('Segment already exist with same name.');
      // }

      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(CustomerSegment);
      const segment = repo.create({
        ...dto,
        status: 1,
        locales: dto?.locales?.map((locale) => ({
          language: { id: locale.languageId },
          name: locale.name,
          description: locale.description,
        })) as any,
      });

      const saved = await repo.save(segment);
      await queryRunner.commitTransaction();

      if (saved.id) {
        const customerIds = dto.selected_customer_ids || [];
        for (let index = 0; index <= customerIds.length - 1; index++) {
          const eachCustomerId = customerIds[index];
          await this.addCustomerToSegment(saved.id, eachCustomerId, permission);
        }
      }

      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    client_id: number,
    page: number = 1,
    pageSize: number = 7,
    name: string,
    permission: any,
    langCode: string = 'en',
  ) {
    if (!permission.canViewCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to access customer segment",
      );
    }
    const take = pageSize;
    const skip = (page - 1) * take;

    const qb = this.segmentRepository
      .createQueryBuilder('segment')
      .leftJoinAndSelect('segment.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .leftJoinAndSelect('segment.members', 'members')
      .leftJoinAndSelect('members.customer', 'customer')
      .where('segment.tenant_id = :tenantId', { tenantId: client_id })
      .andWhere('segment.status = :status', { status: 1 })
      .andWhere('language.code = :langCode', { langCode });

    // 🔍 Name-based filter on locale table
    if (name) {
      qb.andWhere(`(locale.name LIKE :name OR locale.description LIKE :name)`, {
        name: `%${name}%`,
      });
    }

    qb.orderBy('segment.created_at', 'DESC').take(take).skip(skip);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: number) {
    return await this.segmentRepository.findOne({
      where: { id },
      relations: ['members', 'members.customer'],
    });
  }

  async getCustomers(segmentId: number) {
    const segment = await this.segmentRepository.findOne({
      where: { id: segmentId },
      relations: ['members', 'members.customer'],
    });
    console.log(`Segment ID: ${segmentId}`, segment);

    if (!segment) {
      throw new NotFoundException(`Segment with ID ${segmentId} not found`);
    }

    return segment;
  }

  async addCustomerToSegment(
    segmentId: number,
    customerId: number,
    permission: any,
  ) {
    if (!permission.canEditCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to edit customer segment",
      );
    }
    const segment = await this.segmentRepository.findOne({
      where: { id: segmentId },
    });
    if (!segment) throw new NotFoundException('Customer segment not found');

    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    const existing = await this.memberRepository.findOne({
      where: { segment_id: segmentId, customer_id: customerId },
    });
    if (existing) return { message: 'Customer already in segment' };

    const member = this.memberRepository.create({
      segment_id: segmentId,
      customer_id: customerId,
    });
    await this.memberRepository.save(member);

    return { message: 'Customer added successfully' };
  }

  async removeCustomerFromSegment(
    segmentId: number,
    customerId: number,
    permission: any,
  ) {
    if (!permission.canEditCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to edit customer segment",
      );
    }
    const segment = await this.segmentRepository.findOne({
      where: { id: segmentId },
    });
    if (!segment) throw new NotFoundException('Customer segment not found');

    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const existing = await this.memberRepository.findOne({
      where: { segment_id: segmentId, customer_id: customerId },
    });
    if (!existing) {
      return { message: 'Customer not in segment' };
    }

    await this.memberRepository.remove(existing);

    return { message: 'Customer removed successfully' };
  }

  async update(
    id: number,
    dto: UpdateCustomerSegmentDto,
    user: string,
    permission: any,
  ) {
    if (!permission.canEditCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to edit customer segment",
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const repo = queryRunner.manager.getRepository(CustomerSegment);

      const segment = await repo.findOne({ where: { id } });
      if (!segment)
        throw new NotFoundException(`Segment with ID ${id} not found`);

      repo.merge(segment, dto);
      const updated = await repo.save(segment);
      await queryRunner.commitTransaction();

      if (updated.id) {
        const customerIds = dto.selected_customer_ids || [];
        for (let index = 0; index <= customerIds.length - 1; index++) {
          const eachCustomerId = customerIds[index];
          await this.addCustomerToSegment(
            updated.id,
            eachCustomerId,
            permission,
          );
        }
      }

      return updated;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, user: string, permission: any) {
    if (!permission.canDeleteCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to delete customer segment",
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const repo = queryRunner.manager.getRepository(CustomerSegment);

      const segment = await repo.findOne({ where: { id } });
      if (!segment)
        throw new NotFoundException(`Segment with ID ${id} not found`);

      segment.status = 0;
      await repo.save(segment);

      await queryRunner.commitTransaction();
      return { message: 'Segment marked as inactive' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkUpload(
    filePath: string,
    body: CreateCustomerSegmentDto,
    user: string,
    permission: any,
  ) {
    if (!permission.canCreateCustomerSegments) {
      throw new BadRequestException(
        "You don't have access to create customer segment",
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(CustomerSegment);

      // ✅ Create segment
      const segment = repo.create({
        ...body,
        status: 1,
      });

      const savedSegment = await repo.save(segment);
      await queryRunner.commitTransaction();

      const customers: any[] = [];

      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(fastcsv.parse({ headers: true }))
          .on('data', (row) => customers.push(row))
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });

      for (const row of customers) {
        try {
          const customer = await this.findOrCreateCustomer(row, body);
          if (customer) {
            await this.addCustomerToSegment(
              savedSegment.id,
              customer.id,
              permission,
            );
          }
        } catch (err) {
          console.error('Row failed:', row, err.message);
        }
      }

      return {
        success: true,
        message: 'Bulk upload complete',
        segmentId: savedSegment.id,
        customersAdded: customers.length,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
      try {
        fs.unlinkSync(filePath); // cleanup
      } catch {}
    }
  }

  private async findOrCreateCustomer(row: any, body: any) {
    const plainMobile = `+${row.country_code}${row.phone_no}`;
    const encryptedPhone = await this.ociService.encryptData(plainMobile);
    const hashedPhone = encrypt(plainMobile);

    let customer = await this.customerRepository.findOne({
      where: {
        hashed_number: hashedPhone,
        business_unit: { id: Number(body.business_unit_id) },
        tenant: { id: Number(body.tenant_id) },
      },
      relations: ['business_unit', 'tenant'],
    });

    if (!customer) {
      customer = this.customerRepository.create({
        phone: encryptedPhone,
        hashed_number: hashedPhone,
        business_unit: { id: Number(body.business_unit_id) },
        tenant: { id: Number(body.tenant_id) },
        uuid: uuidv4(),
        status: 0,
        is_new_user: 1,
        referral_code: nanoid(6).toUpperCase(),
        otp_code: Math.floor(1000 + Math.random() * 9000).toString(),
        otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
      });
      customer = await this.customerRepository.save(customer);

      if (
        !(await this.qrCodeRepo.findOne({
          where: { customer: { id: customer.id } },
        }))
      ) {
        await this.customerService.createAndSaveCustomerQrCode(
          customer.uuid,
          customer.id,
        );
      }

      if (
        !(await this.walletService.getSingleCustomerWalletInfo(
          customer.id,
          Number(body.business_unit_id),
        ))
      ) {
        await this.walletService.createWallet({
          customer_id: customer.id,
          business_unit_id: Number(body.business_unit_id),
          tenant_id: Number(body.tenant_id),
        });
      }
    }
    return customer;
  }
}
