import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchHistoryService {
  private static readonly MAX_USER_HISTORY = 10;
  private static readonly POPULAR_LIMIT = 10;
  private static readonly POPULAR_WINDOW_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  private get searchHistory() {
    const delegate = (this.prisma as any).searchHistory;
    if (!delegate) {
      throw new InternalServerErrorException(
        'Prisma client is not up to date for SearchHistory. Run migration and prisma generate.',
      );
    }
    return delegate;
  }

  private normalizeQuery(query: string) {
    return query.trim().toLowerCase();
  }

  async recordSearch(userId: string, query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    const queryNormalized = this.normalizeQuery(trimmedQuery);

    await this.searchHistory.upsert({
      where: {
        userId_queryNormalized: {
          userId,
          queryNormalized,
        },
      },
      update: {
        query: trimmedQuery,
        updatedAt: new Date(),
      },
      create: {
        userId,
        query: trimmedQuery,
        queryNormalized,
      },
    });

    await this.trimUserHistory(userId);
  }

  async getUserHistory(userId: string) {
    return this.searchHistory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: SearchHistoryService.MAX_USER_HISTORY,
      select: {
        id: true,
        query: true,
        updatedAt: true,
      },
    });
  }

  async clearUserHistory(userId: string) {
    const { count } = await this.searchHistory.deleteMany({
      where: { userId },
    });
    return { deletedCount: count };
  }

  async deleteHistoryItem(userId: string, id: string) {
    const { count } = await this.searchHistory.deleteMany({
      where: {
        id,
        userId,
      },
    });

    if (!count) {
      throw new NotFoundException('Search history item not found');
    }

    return { success: true };
  }

  async getPopularQueries() {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - SearchHistoryService.POPULAR_WINDOW_DAYS);

    const groups = await this.searchHistory.groupBy({
      by: ['queryNormalized'],
      where: {
        updatedAt: {
          gte: fromDate,
        },
      },
      _count: {
        queryNormalized: true,
      },
      _max: {
        updatedAt: true,
      },
      orderBy: [
        {
          _count: {
            queryNormalized: 'desc',
          },
        },
        {
          _max: {
            updatedAt: 'desc',
          },
        },
      ],
      take: SearchHistoryService.POPULAR_LIMIT,
    });

    const latestQueries = await Promise.all(
      groups.map((group) =>
        this.searchHistory.findFirst({
          where: {
            queryNormalized: group.queryNormalized,
            updatedAt: {
              gte: fromDate,
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: {
            query: true,
          },
        }),
      ),
    );

    return latestQueries
      .map((item) => item?.query)
      .filter((item): item is string => Boolean(item));
  }

  async syncUserHistory(userId: string, queries: string[]) {
    const normalizedToDisplay = new Map<string, string>();

    for (const query of queries) {
      if (typeof query !== 'string') {
        continue;
      }

      const trimmed = query.trim();
      if (!trimmed) {
        continue;
      }

      normalizedToDisplay.set(this.normalizeQuery(trimmed), trimmed);
    }

    const uniqueQueries = Array.from(normalizedToDisplay.values());

    // Payload is expected from newest to oldest. Write in reverse so recency is preserved.
    for (let i = uniqueQueries.length - 1; i >= 0; i--) {
      await this.recordSearch(userId, uniqueQueries[i]);
    }

    const history = await this.getUserHistory(userId);
    return {
      syncedCount: uniqueQueries.length,
      total: history.length,
      items: history,
    };
  }

  private async trimUserHistory(userId: string) {
    const oldItems = await this.searchHistory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip: SearchHistoryService.MAX_USER_HISTORY,
      select: { id: true },
    });

    if (!oldItems.length) {
      return;
    }

    await this.searchHistory.deleteMany({
      where: {
        id: {
          in: oldItems.map((item) => item.id),
        },
      },
    });
  }
}
