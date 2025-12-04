import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  Param,
  Query,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { CreateWalletTransactionDto } from '../dto/create-wallet-transaction.dto';
import { CreateWalletSettingsDto } from '../dto/create-wallet-settings.dto';
import { User } from 'src/users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { CreateWalletOrderDto } from '../dto/create-wallet-order.dto';
import { WalletAccessGuard } from './wallets-access.guard';
import { WALLETSAccess } from './wallets-access.decorator';

@Controller('wallets')
export class WalletController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly walletService: WalletService,
  ) {}

  @Post()
  async createWallet(@Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(dto);
  }

  @Post('transactions')
  async addTransaction(
    @Body() dto: CreateWalletTransactionDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return this.walletService.addTransaction(dto, user.id);
  }

  @Get(':id/transactions')
  async getWalletTransactions(
    @Param('id') walletId: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('query') query?: string,
  ) {
    return this.walletService.getWalletTransactions(
      walletId,
      page,
      pageSize,
      query,
    );
  }

  @UseGuards(WalletAccessGuard)
  @WALLETSAccess()
  @Get(':client_id')
  async listWallets(
    @Req() req: any,
    @Param('client_id') client_id: number,
    @Query('business_unit') buId?: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.walletService.listWallets(
      req.permission,
      client_id,
      buId,
      page,
      pageSize,
    );
  }

  @UseGuards(WalletAccessGuard)
  @WALLETSAccess()
  @Get('settings/:businessUnitId')
  async getSettings(@Req() req: any, @Param('businessUnitId') id: number) {
    return this.walletService.getSettingsByBusinessUnit(id, req.permission);
  }

  @UseGuards(WalletAccessGuard)
  @WALLETSAccess()
  @Get('all-settings/:client_id')
  async getAllWalltetSettings(
    @Req() req: any,
    @Param('client_id') client_id: number,
  ) {
    return this.walletService.getAllWalltetSettings(client_id, req.permission);
  }

  @UseGuards(WalletAccessGuard)
  @WALLETSAccess()
  @Post('settings/:client_id')
  async saveSettings(
    @Req() req: any,
    @Param('client_id') client_id: number,
    @Body() dto: CreateWalletSettingsDto,
  ) {
    return this.walletService.saveOrUpdateSettings(
      client_id,
      dto,
      req.permission,
    );
  }

  @Post('create-transaction')
  async createTransaction(@Body() dto: CreateWalletTransactionDto) {
    return this.walletService.addTransaction(dto, null, true);
  }

  @Post('create-order')
  async createOrder(@Body() dto: CreateWalletOrderDto) {
    return this.walletService.addOrder(dto);
  }
}
