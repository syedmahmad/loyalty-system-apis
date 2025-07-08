import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const token = authHeader.split(' ')[1];
    const user = await this.validateAuthToken(token);

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Attach user to request object
    (request as any).user = user;

    return true;
  }

  async validateAuthToken(token: string): Promise<any> {
    const decodedUser: any = jwt.decode(token);

    if (!decodedUser?.UserId) {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or token mismatch');
    }

    return user;
  }
}
