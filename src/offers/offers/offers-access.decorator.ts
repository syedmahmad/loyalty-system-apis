import { SetMetadata } from '@nestjs/common';

export const OFFERS_ACCESS_KEY = 'OFFERS_access';
export const OFFERSAccess = () => SetMetadata(OFFERS_ACCESS_KEY, true);
