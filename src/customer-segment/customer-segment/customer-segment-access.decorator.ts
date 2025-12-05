import { SetMetadata } from '@nestjs/common';

export const CUSTOMER_SEGMENTS_ACCESS_KEY = 'CUSTOMER_SEGMENTS_access';
export const CUSTOMER_SEGMENTSAccess = () =>
  SetMetadata(CUSTOMER_SEGMENTS_ACCESS_KEY, true);
