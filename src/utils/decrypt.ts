/* eslint-disable @typescript-eslint/no-unsafe-return */
import { OciService } from '../oci/oci.service';
import { ConfigService } from '@nestjs/config';

export async function decrypt(param: string): Promise<string> {
  const configService = new ConfigService();
  const oci = new OciService(configService);
  return await oci.decryptData(param);
}
