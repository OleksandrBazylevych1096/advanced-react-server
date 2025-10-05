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
    // Refresh rates if they are older than 1 hour
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

    // Convert to USD first (if not already in USD)
    const amountInUSD =
      fromCurrency === 'USD' ? amount : amount / rates[fromCurrency];

    // Convert from USD to target currency
    const convertedAmount = amountInUSD * rates[toCurrency];

    // Round to 2 decimal places
    return Math.round(convertedAmount * 100) / 100;
  }
}
