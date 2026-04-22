import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ExchangeRateService {
  private readonly apiUrl = 'https://open.er-api.com/v6/latest';
  private readonly baseCurrency = 'USD';
  private ratesCache: { [key: string]: number } = {};
  private lastUpdate: Date | null = null;

  private async fetchRates(): Promise<void> {
    try {
      const response = await axios.get(`${this.apiUrl}/${this.baseCurrency}`);
      this.ratesCache = response.data.rates;
      this.lastUpdate = new Date();
    } catch (error) {
      throw new HttpException(
        'Failed to fetch exchange rates',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async getRates(): Promise<{ [key: string]: number }> {
    if (
      !this.lastUpdate ||
      new Date().getTime() - this.lastUpdate.getTime() > 3600000
    ) {
      await this.fetchRates();
    }
    return this.ratesCache;
  }

  async convertPrice(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rates = await this.getRates();

    if (!rates[fromCurrency] || !rates[toCurrency]) {
      throw new HttpException('Invalid currency code', HttpStatus.BAD_REQUEST);
    }
    const amountInUSD =
      fromCurrency === 'USD' ? amount : amount / rates[fromCurrency];
    const convertedAmount = amountInUSD * rates[toCurrency];
    return Math.round(convertedAmount * 100) / 100;
  }
}
