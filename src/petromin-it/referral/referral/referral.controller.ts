import { Controller, Get, Param } from '@nestjs/common';
import { ReferralService } from './referral.service';

@Controller('customers/referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  // GET /customer/referral/:customerId
  @Get(':customerId')
  async getReferralHistory(@Param('customerId') customerId: string) {
    return this.referralService.getReferralHistory(customerId);
  }
}
