import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../entities/user.entity';
import { OciService } from 'src/oci/oci.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ociService: OciService,
  ) {}

  async validateToken({ token }: { token: string }): Promise<any> {
    let decodedUser: any = {};
    try {
      decodedUser = jwt.decode(token);
      if (!decodedUser) {
        throw new BadRequestException('Invalid token');
      }

      const raw = process.env.ALLOWED_DOMAINS || '';
      const ALLOWED_DOMAINS = raw
        .split(',')
        .map((domain) => domain.trim().toLowerCase());
      const userEmail = decodedUser.email || decodedUser.preferred_username;

      const encryptedEmail = await this.ociService.encryptData(userEmail);

      const isValid = ALLOWED_DOMAINS.some((domain) =>
        userEmail.endsWith(domain),
      );

      if (!isValid) {
        throw new UnauthorizedException(
          'Your Email is not authorized. Only allowed domains are eligible.',
        );
      }

      let user = await this.userRepository.findOne({
        where: { email: encryptedEmail },
      });

      const privileges = await this.handleverify_with_access(userEmail);
      const encryptedPhoneNumber = await this.ociService.encryptData(
        decodedUser?.phone_number,
      );

      if (!user) {
        user = this.userRepository.create({
          email: encryptedEmail,
          first_name: decodedUser?.given_name || decodedUser.name,
          last_name: decodedUser?.family_name,
          mobile: encryptedPhoneNumber,
          user_role: 'User',
          role_key: 'user',
          user_privileges: privileges,
          is_active: 1,
          uuid: uuidv4(),
        });
        user = await this.userRepository.save(user);
      } else {
        user.first_name = decodedUser?.given_name || decodedUser.name;
        user.last_name = decodedUser?.family_name;
        user.mobile = encryptedPhoneNumber;
        user.email = encryptedEmail;
        user.user_privileges = privileges;
        user.is_active = 1;
        user = await this.userRepository.save(user);
      }

      const jwtSecret: any = process.env.JWT_SECRET;

      const newToken = jwt.sign(
        {
          id: user.id,
          first_name: user.first_name,
          middle_name: user.middle_name,
          last_name: user.last_name,
          email: user.email,
          mobile: user.mobile,
          created_date: user.created_date,
          deactivate_date: user.deactivate_date,
          is_active: user.is_active,
          uuid: user.uuid,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          UserId: user.id,
        },
        jwtSecret,
        { expiresIn: '7d' },
      );

      return {
        user,
        token: newToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      if (error.response) {
        throw new UnauthorizedException({
          message:
            `${error.response.data.message} ${decodedUser.email || decodedUser.preferred_username}` ||
            `Verification failed for ${decodedUser.email || decodedUser.preferred_username}`,
        });
      }

      throw new UnauthorizedException({
        message: 'An error occurred during verification',
      });
    }
  }

  async handleverify_with_access(record: string): Promise<any[]> {
    try {
      const response = await axios.post(
        `${process.env.CAM_API}/access/verify`,
        { email: record },
        {
          validateStatus: (status) => status < 500,
        },
      );

      if (!response.data.status || !response.data.data?.user_roles?.length) {
        throw new UnauthorizedException({
          message: `There is no role assigned ${record}`,
        });
      }

      const userRoles = response.data.data.user_roles;

      const hasBusinessUnitAccess = userRoles.some(
        (role: any) => role.business_unit === process.env.BUSINESS,
      );

      if (!hasBusinessUnitAccess) {
        throw new UnauthorizedException({
          message: `You are not authorized for ${process.env.BUSINESS}`,
        });
      }

      const allPrivileges = userRoles.reduce((acc: any[], role: any) => {
        if (role.privillage && role.privillage.length) {
          return [...acc, ...role.privillage];
        }
        return acc;
      }, []);

      return allPrivileges;
    } catch (error) {
      throw error;
    }
  }
}
