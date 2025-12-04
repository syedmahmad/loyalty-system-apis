import { SetMetadata } from '@nestjs/common';

export const ANALYTICS_ACCESS_KEY = 'ANALYTICS_access';
export const ANALYTICSAccess = () => SetMetadata(ANALYTICS_ACCESS_KEY, true);
