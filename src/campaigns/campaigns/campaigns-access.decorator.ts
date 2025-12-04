import { SetMetadata } from '@nestjs/common';

export const CAMPAIGNS_ACCESS_KEY = 'CAMPAIGNS_access';
export const CAMPAIGNSAccess = () => SetMetadata(CAMPAIGNS_ACCESS_KEY, true);
