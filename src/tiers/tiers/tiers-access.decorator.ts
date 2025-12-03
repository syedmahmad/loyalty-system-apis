import { SetMetadata } from '@nestjs/common';

export const TIERS_ACCESS_KEY = 'TIERS_access';
export const TIERSAccess = () => SetMetadata(TIERS_ACCESS_KEY, true);
