import { Controller, Post, Injectable, Body } from '@nestjs/common';
import { OciService } from './oci.service';

@Controller('oci')
@Injectable()
export class OciController {
  constructor(private readonly ociService: OciService) {}

  @Post('encrypt')
  async encrypt(
    @Body()
    body: any,
  ): Promise<any> {
    const data = await this.ociService.encryptData(body.data);
    return { data: data };
  }

  @Post('decrypt')
  async decrypt(
    @Body()
    body: any,
  ): Promise<any> {
    const data = await this.ociService.decryptData(body.data);
    return { data: data };
  }
}
