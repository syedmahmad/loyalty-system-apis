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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import * as jwt from 'jsonwebtoken';
import { User } from 'src/users/entities/user.entity';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { Repository } from 'typeorm';
import { CreateOfferDto, UpdateOfferDto } from '../dto/offers.dto';
import { OffersService } from './offers.service';
import { OfferAccessGuard } from './offers-access.guard';
import { OFFERSAccess } from './offers-access.decorator';

@Controller('offers')
export class OffersController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly service: OffersService,
  ) {}

  @UseGuards(AuthTokenGuard, OfferAccessGuard)
  @OFFERSAccess()
  @Post()
  async create(
    @Body() dto: CreateOfferDto,
    @Headers('user-secret') userSecret: string,
    @Req() req: any,
  ) {
    try {
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
      return await this.service.create(dto, user.uuid, req.permission);
    } catch (error) {
      return {
        success: true,
        message: 'Failed to fetched the data!',
        error: error.message,
      };
    }
  }

  @UseGuards(OfferAccessGuard)
  @OFFERSAccess()
  @Get('/:client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Req() req: any,
    @Headers('user-secret') userSecret: string,
    @Query('name') name?: string,
    @Query('bu') bu?: number,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
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
      langCode,
      req.permission,
    );
  }

  @Get('/third-party/:tenant_id')
  async findAllForThirdParty(
    @Param('tenant_id') tenant_id: number,
    @Query('name') name?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('langCode') langCode?: string,
  ) {
    return await this.service.findAllForThirdParty(
      tenant_id,
      name,
      page,
      pageSize,
      langCode,
    );
  }

  @Get('edit/:id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(id);
  }

  @Delete('/remove-file')
  async removeFile(@Query('url') fileUrl: string) {
    return await this.service.removeFile(fileUrl);
  }

  @UseGuards(AuthTokenGuard, OfferAccessGuard)
  @OFFERSAccess()
  @Delete(':uuid')
  async remove(
    @Req() req: any,
    @Param('uuid') uuid: string,
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
    return await this.service.remove(uuid, user.uuid, req.permission);
  }

  @UseGuards(AuthTokenGuard, OfferAccessGuard)
  @OFFERSAccess()
  @Put(':id')
  async update(
    @Req() req: any,
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
    return await this.service.update(id, dto, user.uuid, req.permission);
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

  @Get('/active-and-expired-offers/:tenant_id')
  async getAllActiveAndExpiredOffers(
    @Param('tenant_id') tenant_id: number,
    @Query('langCode') langCode: string,
  ) {
    return await this.service.getAllActiveAndExpiredOffers(tenant_id, langCode);
  }
}
