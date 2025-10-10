import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as jwt from 'jsonwebtoken';
import { User } from 'src/users/entities/user.entity';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { Repository } from 'typeorm';
import { CreateOfferDto, UpdateOfferDto } from '../dto/offers.dto';
import { OffersService } from './offers.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('offers')
export class OffersController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly service: OffersService,
  ) {}

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateOfferDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }
    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }
    return await this.service.create(dto, user.uuid);
  }

  @Get('/:client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Headers('user-secret') userSecret: string,
    @Query('name') name?: string,
    @Query('bu') bu?: number,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('isCallingFromAdminPanel') isCallingFromAdminPanel?: boolean,
    @Query('langCode') langCode?: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return await this.service.findAll(
      client_id,
      name,
      limit,
      user.id,
      bu,
      page,
      pageSize,
      isCallingFromAdminPanel,
      langCode,
    );
  }

  @Get('edit/:id')
  async findOne(
    @Param('id') id: string,
    @Query('isCallingFromAdminPanel') isCallingFromAdminPanel: boolean,
    @Query('langCode') langCode: string,
  ) {
    return await this.service.findOne(+id, isCallingFromAdminPanel, langCode);
  }

  @UseGuards(AuthTokenGuard)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }
    return await this.service.remove(+id, user.uuid);
  }

  @UseGuards(AuthTokenGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
    @Body() dto: UpdateOfferDto,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }
    return await this.service.update(+id, dto, user.uuid);
  }

  @Post('upload-file-to-bucket')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileToBucket(@UploadedFile() file: any) {
    const bucketName = process.env.OCI_BUCKET;
    const objectName = file.originalname;
    const buffer = file.buffer;

    const response = await this.service.uploadFileToBucket(
      buffer,
      bucketName,
      objectName,
    );

    if (response) {
      return {
        success: true,
        message: 'File uploaded successfully',
        uploaded_url: `${process.env.OCI_URL}/${objectName}`,
      };
    }

    return {
      success: false,
      message: 'Failed to upload file',
    };
  }
}
