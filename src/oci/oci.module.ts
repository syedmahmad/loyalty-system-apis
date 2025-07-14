import { Module } from '@nestjs/common';
import { OciService } from './oci.service';
import { OciController } from './oci.controller';

@Module({
  controllers: [OciController],
  providers: [OciService],
  exports: [OciService],
})
export class OciModule {}
