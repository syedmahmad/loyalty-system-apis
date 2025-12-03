import { SetMetadata } from '@nestjs/common';

export const CUSTOMERS_ACCESS_KEY = 'CUSTOMERS_access';
export const CUSTOMERSAccess = () => SetMetadata(CUSTOMERS_ACCESS_KEY, true);
