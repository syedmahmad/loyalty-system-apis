import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity'; // adjust path as needed
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { OciModule } from 'src/oci/oci.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User]), OciModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
