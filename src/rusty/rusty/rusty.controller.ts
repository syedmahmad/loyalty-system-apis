import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { RustyService } from './rusty.service';
import * as jwt from 'jsonwebtoken';

@Controller('/datamart')
export class RustyController {
  constructor(private readonly rustyService: RustyService) {}

  /**
   * ✅ API 1: Populate Bulk Data
   * POST /api/v1/users/datamart
   */
  @Post('bulk-create')
  async populateDatamart(@Req() req: any, @Body() body: any) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.decode(token);

    if (!decoded || !decoded.name || decoded.name !== 'Rusty') {
      throw new UnauthorizedException('Invalid token in payload');
    }

    // ✅ Pass full body to service for saving
    return this.rustyService.populateData(body);
  }

  /**
   * ✅ API 2: Get Latest Timestamp
   * GET /api/v1/users/datamart/timestamp
   */
  @Get('timestamp')
  async getLatestTimestamp(@Req() req: any) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.decode(token);

    if (!decoded || !decoded.name || decoded.name !== 'Rusty') {
      throw new UnauthorizedException('Invalid token in payload');
    }

    const ts = await this.rustyService.getLatestTimestamp();
    return {
      success: true,
      message: 'Successfully fetched latest timestamp!...',
      data: { time_stamp: ts },
      errors: [],
    };
  }
}
