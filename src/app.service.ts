import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return { message: 'PETROMINit Loyalty API Is Live' };
  }
}
