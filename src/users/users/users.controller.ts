import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Post('validateToken')
  async validateToken(@Body() body: { token: string }): Promise<User> {
    return await this.userService.validateToken(body);
  }
}
