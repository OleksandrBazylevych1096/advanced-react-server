import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUserId } from '../auth/decorators/get-user-id.decorator';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @GetUserId() userId: string,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.reviewService.create(userId, createReviewDto);
  }

  @Get()
  findAll(@Query() query: ReviewQueryDto) {
    return this.reviewService.findAll(query);
  }

  @Get('recent')
  getRecentReviews(@Query('limit') limit?: string) {
    const limitNumber = limit ? parseInt(limit) : 10;
    return this.reviewService.getRecentReviews(limitNumber);
  }

  @Get('my-reviews')
  @UseGuards(JwtAuthGuard)
  findUserReviews(@GetUserId() userId: string, @Query() query: ReviewQueryDto) {
    return this.reviewService.findByUser(userId, query);
  }

  @Get('product/:productId')
  findByProduct(
    @Param('productId') productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.findByProduct(productId, query);
  }

  @Get('product/:productId/stats')
  getProductReviewStats(@Param('productId') productId: string) {
    return this.reviewService.getProductReviewStats(productId);
  }

  @Get('can-review/:productId')
  @UseGuards(JwtAuthGuard)
  canUserReview(
    @GetUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return this.reviewService.canUserReview(userId, productId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reviewService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @GetUserId() userId: string,
    @Body() updateReviewDto: UpdateReviewDto,
  ) {
    return this.reviewService.update(id, userId, updateReviewDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @GetUserId() userId: string) {
    return this.reviewService.remove(id, userId);
  }
}
