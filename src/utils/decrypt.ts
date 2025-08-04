/* eslint-disable @typescript-eslint/no-unsafe-return */
import { OciService } from '../oci/oci.service';

export async function decrypt(param: string): Promise<string> {
  const oci = new OciService();
  return await oci.decryptData(param);
}
