import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingAddressService } from '../shipping-address/shipping-address.service';
import { DeliverySlotsQueryDto } from './dto/delivery-slots-query.dto';
import { SetDeliverySelectionDto } from './dto/set-delivery-selection.dto';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';

type DeliveryZone = 'local' | 'regional' | 'remote' | 'international';
type DeliveryProfile = {
  zone: DeliveryZone;
  minLeadDays: number;
  slotCapacity: number;
  candidateTimeSlots: string[];
  minSlotsPerDay: number;
  maxSlotsPerDay: number;
  skipChance: number;
};
type ResolvedDeliveryAddress = {
  shippingAddress?: string;
  shippingCity: string;
  shippingCountry: string;
  shippingPostal: string;
  latitude?: number;
  longitude?: number;
};

@Injectable()
export class DeliverySelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingAddressService: ShippingAddressService,
    private readonly configService: ConfigService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async getDeliverySlots(userId: string, query: DeliverySlotsQueryDto) {
    const locale = this.normalizeLocale(query.locale);
    const currency = this.normalizeCurrency(query.currency);
    const days = query.days ?? 7;
    const address = await this.resolveDeliveryAddress(userId, query);
    const profile = this.resolveDeliveryProfile(address);
    const today = new Date();
    const availableDates: Array<{ date: string; displayDate: string; slots: string[] }> = [];

    let dayOffset = profile.minLeadDays;
    let examinedDays = 0;
    const maxExaminedDays = Math.max(days * 8, 40);

    while (availableDates.length < days && examinedDays < maxExaminedDays) {
      const date = this.addUtcDays(today, dayOffset);
      dayOffset += 1;
      examinedDays += 1;

      if (date.getUTCDay() === 0) {
        continue;
      }

      const dayStart = new Date(date);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const ordersForDay = await this.prisma.order.findMany({
        where: {
          shippingCity: {
            equals: address.shippingCity,
            mode: 'insensitive',
          },
          shippingCountry: {
            equals: address.shippingCountry,
            mode: 'insensitive',
          },
          deliveryDate: {
            gte: dayStart,
            lt: dayEnd,
          },
          status: {
            not: 'CANCELLED',
          },
        },
        select: {
          deliveryTime: true,
        },
      });

      const occupiedByTime = ordersForDay.reduce<Record<string, number>>(
        (acc, order) => {
          if (!order.deliveryTime) {
            return acc;
          }

          acc[order.deliveryTime] = (acc[order.deliveryTime] || 0) + 1;
          return acc;
        },
        {},
      );

      const randomizedSlots = this.buildRandomizedDailySlots(
        profile,
        address,
        dayStart,
      );

      if (!randomizedSlots.length) {
        continue;
      }

      const slots = randomizedSlots.filter((time) => {
        const occupied = occupiedByTime[time] || 0;
        return occupied < profile.slotCapacity;
      });

      if (!slots.length) {
        continue;
      }

      availableDates.push({
        date: dayStart.toISOString().slice(0, 10),
        displayDate: this.formatDeliveryDate(dayStart, locale),
        slots,
      });
    }

    const pricing = await this.getDeliveryPricing(currency);

    return {
      availableDates,
      meta: {
        locale,
        currency,
        zone: profile.zone,
        pricing,
      },
    };
  }

  async setSelection(userId: string, dto: SetDeliverySelectionDto) {
    const dayStart = new Date(dto.deliveryDate);
    dayStart.setUTCHours(0, 0, 0, 0);

    if (Number.isNaN(dayStart.getTime())) {
      throw new BadRequestException('Invalid deliveryDate');
    }

    const slotMap = await this.getDeliverySlots(userId, {
      days: 14,
      addressId: dto.addressId,
    });

    const selectedDate = slotMap.availableDates.find(
      (item) => item.date === dayStart.toISOString().slice(0, 10),
    );

    if (!selectedDate || !selectedDate.slots.includes(dto.deliveryTime)) {
      throw new BadRequestException('Selected delivery slot is unavailable');
    }

    await this.prisma.deliverySelection.upsert({
      where: { userId },
      create: {
        userId,
        deliveryDate: dayStart,
        deliveryTime: dto.deliveryTime,
      },
      update: {
        deliveryDate: dayStart,
        deliveryTime: dto.deliveryTime,
      },
    });

    return this.getStoredSelection(userId);
  }

  async clearSelection(userId: string) {
    await this.prisma.deliverySelection.deleteMany({
      where: { userId },
    });

    return null;
  }

  async getStoredSelection(userId: string, locale: string = 'en') {
    const normalizedLocale = this.normalizeLocale(locale);
    const selection = await this.prisma.deliverySelection.findUnique({
      where: { userId },
    });

    if (!selection) {
      return null;
    }

    return {
      deliveryDate: selection.deliveryDate.toISOString().slice(0, 10),
      deliveryDateLabel: this.formatDeliveryDate(selection.deliveryDate, normalizedLocale),
      deliveryTime: selection.deliveryTime,
    };
  }

  private getFreeShippingTarget(): number {
    const target = Number(this.configService.get('FREE_SHIPPING_TARGET') ?? 100);
    return Number.isFinite(target) && target >= 0 ? target : 100;
  }

  private getEstimatedShippingFee(): number {
    const fee = Number(this.configService.get('ESTIMATED_SHIPPING_FEE') ?? 10);
    return Number.isFinite(fee) && fee >= 0 ? fee : 10;
  }

  private normalizeLocale(locale?: string): string {
    const normalized = (locale || 'en').trim().toLowerCase();
    return normalized || 'en';
  }

  private normalizeCurrency(currency?: string): string {
    const normalized = (currency || 'USD').trim().toUpperCase();
    return normalized || 'USD';
  }

  private async toCurrencyAmount(amount: number, currency: string): Promise<number> {
    if (currency === 'USD') {
      return amount;
    }

    return this.exchangeRateService.convertPrice(amount, 'USD', currency);
  }

  private formatDeliveryDate(date: Date, locale: string): string {
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      }).format(date);
    }
  }

  private async getDeliveryPricing(currency: string) {
    const freeShippingTargetUsd = this.getFreeShippingTarget();
    const estimatedShippingFeeUsd = this.getEstimatedShippingFee();

    const [freeShippingTarget, estimatedShippingFee] = await Promise.all([
      this.toCurrencyAmount(freeShippingTargetUsd, currency),
      this.toCurrencyAmount(estimatedShippingFeeUsd, currency),
    ]);

    return {
      freeShippingTarget,
      estimatedShippingFee,
    };
  }

  private async resolveDeliveryAddress(
    userId: string,
    query: DeliverySlotsQueryDto,
  ): Promise<ResolvedDeliveryAddress> {
    if (query.addressId) {
      const savedAddress = await this.shippingAddressService.findOne(
        query.addressId,
        userId,
      );

      return {
        shippingAddress: savedAddress.streetAddress,
        shippingCity: savedAddress.city,
        shippingCountry: savedAddress.country || 'UA',
        shippingPostal: savedAddress.zipCode,
        latitude: savedAddress.latitude ?? undefined,
        longitude: savedAddress.longitude ?? undefined,
      };
    }

    if (!query.shippingCity && !query.shippingCountry && !query.shippingPostal) {
      const defaultAddress = await this.shippingAddressService.getDefault(userId);

      if (!defaultAddress) {
        throw new BadRequestException(
          'Default address not found. Provide either addressId or shippingCity, shippingCountry and shippingPostal',
        );
      }

      return {
        shippingAddress: defaultAddress.streetAddress,
        shippingCity: defaultAddress.city,
        shippingCountry: defaultAddress.country || 'UA',
        shippingPostal: defaultAddress.zipCode,
        latitude: defaultAddress.latitude ?? undefined,
        longitude: defaultAddress.longitude ?? undefined,
      };
    }

    if (!query.shippingCity || !query.shippingCountry || !query.shippingPostal) {
      throw new BadRequestException(
        'Provide either addressId or shippingCity, shippingCountry and shippingPostal',
      );
    }

    return {
      shippingAddress: query.shippingAddress,
      shippingCity: query.shippingCity,
      shippingCountry: query.shippingCountry,
      shippingPostal: query.shippingPostal,
      latitude: query.latitude,
      longitude: query.longitude,
    };
  }

  private resolveDeliveryProfile(address: ResolvedDeliveryAddress): DeliveryProfile {
    const country = address.shippingCountry.trim().toUpperCase();
    const city = address.shippingCity.trim().toLowerCase();
    const postal = address.shippingPostal.trim();
    const majorCities = new Set(['kyiv', 'kiev', 'lviv', 'odesa', 'kharkiv', 'dnipro']);
    const supportedDomesticCountries = new Set(['UA']);
    const isDomestic = supportedDomesticCountries.has(country);
    const isMajorCity = majorCities.has(city);
    const isKyivPostal = postal.startsWith('01') || postal.startsWith('02');

    if (!isDomestic) {
      return {
        zone: 'international',
        minLeadDays: 5,
        slotCapacity: 2,
        candidateTimeSlots: ['10:30', '12:00', '14:30', '16:30', '18:00'],
        minSlotsPerDay: 1,
        maxSlotsPerDay: 2,
        skipChance: 0.45,
      };
    }

    if (isMajorCity || isKyivPostal) {
      return {
        zone: 'local',
        minLeadDays: 1,
        slotCapacity: 6,
        candidateTimeSlots: [
          '09:30',
          '10:00',
          '11:30',
          '12:00',
          '13:30',
          '14:00',
          '15:30',
          '16:00',
          '17:30',
          '18:00',
          '19:30',
        ],
        minSlotsPerDay: 2,
        maxSlotsPerDay: 5,
        skipChance: 0.18,
      };
    }

    if (postal.length >= 5) {
      return {
        zone: 'regional',
        minLeadDays: 2,
        slotCapacity: 4,
        candidateTimeSlots: [
          '09:30',
          '10:30',
          '11:30',
          '13:00',
          '14:30',
          '16:00',
          '17:30',
        ],
        minSlotsPerDay: 2,
        maxSlotsPerDay: 4,
        skipChance: 0.28,
      };
    }

    return {
      zone: 'remote',
      minLeadDays: 3,
      slotCapacity: 3,
      candidateTimeSlots: ['10:30', '12:30', '14:30', '16:30', '18:30'],
      minSlotsPerDay: 1,
      maxSlotsPerDay: 3,
      skipChance: 0.35,
    };
  }

  private buildRandomizedDailySlots(
    profile: DeliveryProfile,
    address: ResolvedDeliveryAddress,
    dayStart: Date,
  ): string[] {
    const dateKey = dayStart.toISOString().slice(0, 10);
    const seedBase = `${address.shippingCountry}|${address.shippingCity}|${address.shippingPostal}|${dateKey}`;
    const random = this.createSeededRandom(seedBase);

    if (random() < profile.skipChance) {
      return [];
    }

    const max = Math.min(
      profile.maxSlotsPerDay,
      profile.candidateTimeSlots.length,
    );
    const min = Math.min(profile.minSlotsPerDay, max);
    const count = min + Math.floor(random() * (max - min + 1));
    const pool = [...profile.candidateTimeSlots];
    const picked: string[] = [];

    while (picked.length < count && pool.length) {
      const idx = Math.floor(random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }

    return picked.sort((a, b) => a.localeCompare(b));
  }

  private createSeededRandom(seedText: string): () => number {
    let seed = this.hashText(seedText) || 1;

    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  private hashText(value: string): number {
    let hash = 0;

    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }

    return hash;
  }

  private addUtcDays(baseDate: Date, days: number): Date {
    const utcDate = new Date(
      Date.UTC(
        baseDate.getUTCFullYear(),
        baseDate.getUTCMonth(),
        baseDate.getUTCDate(),
      ),
    );
    utcDate.setUTCDate(utcDate.getUTCDate() + days);
    return utcDate;
  }
}
