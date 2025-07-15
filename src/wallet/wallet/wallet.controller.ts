import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { CreateWalletTransactionDto } from '../dto/create-wallet-transaction.dto';
import { CreateWalletSettingsDto } from '../dto/create-wallet-settings.dto';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  async createWallet(@Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(dto);
  }

  @Post('transactions')
  async addTransaction(@Body() dto: CreateWalletTransactionDto) {
    return this.walletService.addTransaction(dto);
  }

  @Get(':id/transactions')
  async getWalletTransactions(@Param('id') walletId: number) {
    return this.walletService.getWalletTransactions(walletId);
  }

  @Get()
  async listWallets(@Query('business_unit') buId?: number) {
    return this.walletService.listWallets(buId);
  }

  @Get('settings/:businessUnitId')
  async getSettings(@Param('businessUnitId') id: number) {
    return this.walletService.getSettingsByBusinessUnit(id);
  }

  @Post('settings')
  async saveSettings(@Body() dto: CreateWalletSettingsDto) {
    return this.walletService.saveOrUpdateSettings(dto);
  }
}
