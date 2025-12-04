import { SetMetadata } from '@nestjs/common';

export const RULES_ACCESS_KEY = 'RULES_access';
export const RULESAccess = () => SetMetadata(RULES_ACCESS_KEY, true);
