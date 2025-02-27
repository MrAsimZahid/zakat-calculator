import { StockValues, StockPrices, StockHolding } from '@/lib/assets/stocks'
import { initialStockPrices, DEFAULT_HAWL_STATUS } from '../constants'
import { getAssetType } from '@/lib/assets/registry'
import { getStockPrice, getBatchStockPrices } from '@/lib/api/stocks'
import { Investment, PassiveCalculations } from '@/lib/assets/types'
import { StateCreator } from 'zustand'
import { ZakatState, ActiveStock } from '../types'
import { NISAB, ZAKAT_RATE } from '@/lib/constants'
import { roundCurrency } from '@/lib/utils/currency'

// Define a proper type for the currency store
interface CurrencyStore {
  convertAmount: (amount: number, fromCurrency: string, toCurrency: string) => number;
  getState: () => any;
  // Add other properties and methods as needed
}

export interface PassiveInvestmentStateV1 {
  version: '1.0'
  investments: Array<{
    id: string
    name: string
    shares: number
    pricePerShare: number
    marketValue: number
  }>
  method: 'quick' | 'detailed'
  marketValue: number
  zakatableValue: number
  companyData?: {
    cash: number
    receivables: number
    inventory: number
    totalShares: number
    yourShares: number
    displayProperties?: {
      currency: string
      sharePercentage: number
    }
  }
}

export interface PassiveInvestmentStateV2 extends Omit<PassiveInvestmentStateV1, 'version'> {
  version: '2.0'
  hawlStatus: {
    isComplete: boolean
    startDate?: string
    endDate?: string
  }
  displayProperties: {
    currency: string
    method: string
    totalLabel: string
  }
}

export type PassiveInvestmentState = PassiveInvestmentStateV2

// Add type for current state to handle migration cases
type CurrentPassiveInvestmentState = Partial<PassiveInvestmentState> & {
  version?: '1.0' | '2.0'
  method: 'quick' | 'detailed'
  investments?: Investment[]
  marketValue?: number
  zakatableValue?: number
  companyData?: {
    cash: number
    receivables: number
    inventory: number
    totalShares: number
    yourShares: number
    displayProperties?: {
      currency: string
      sharePercentage: number
    }
  }
  hawlStatus?: {
    isComplete: boolean
    startDate?: string
    endDate?: string
  }
  displayProperties?: {
    currency: string
    method: string
    totalLabel: string
  }
}

type Version = '1.0' | '2.0';

const migratePassiveInvestments = (state: CurrentPassiveInvestmentState): PassiveInvestmentState | undefined => {
  if (!state) return undefined

  try {
    // Handle unversioned state (pre-versioning)
    if (!state.version) {
      return {
        version: '2.0' as const,
        investments: Array.isArray(state.investments) ? state.investments : [{
          id: Date.now().toString(),
          name: '',
          shares: 0,
          pricePerShare: 0,
          marketValue: 0
        }],
        method: typeof state.method === 'string' && ['quick', 'detailed'].includes(state.method)
          ? state.method
          : 'quick',
        marketValue: typeof state.marketValue === 'number' ? state.marketValue : 0,
        zakatableValue: typeof state.zakatableValue === 'number' ? state.zakatableValue : 0,
        companyData: state.companyData || undefined,
        hawlStatus: {
          isComplete: false,
          startDate: new Date().toISOString(),
        },
        displayProperties: {
          currency: 'USD',
          method: state.method === 'quick' ? '30% Rule' : 'CRI Method',
          totalLabel: state.method === 'quick' ? 'Total Investments' : 'Total Company Assets'
        }
      }
    }

    // Migrate from V1 to V2
    const version = state.version as Version;
    if (version === '1.0') {
      const v2State: PassiveInvestmentState = {
        version: '2.0' as const,
        investments: Array.isArray(state.investments) ? state.investments : [{
          id: Date.now().toString(),
          name: '',
          shares: 0,
          pricePerShare: 0,
          marketValue: 0
        }],
        method: typeof state.method === 'string' && ['quick', 'detailed'].includes(state.method)
          ? state.method
          : 'quick',
        marketValue: typeof state.marketValue === 'number' ? state.marketValue : 0,
        zakatableValue: typeof state.zakatableValue === 'number' ? state.zakatableValue : 0,
        companyData: state.companyData,
        hawlStatus: {
          isComplete: false,
          startDate: new Date().toISOString(),
        },
        displayProperties: {
          currency: 'USD',
          method: state.method === 'quick' ? '30% Rule' : 'CRI Method',
          totalLabel: state.method === 'quick' ? 'Total Investments' : 'Total Company Assets'
        }
      }
      return v2State
    }

    // For V2, validate and sanitize the data
    if (version === '2.0') {
      return {
        version: '2.0' as const,
        investments: Array.isArray(state.investments) ? state.investments : [],
        method: typeof state.method === 'string' && ['quick', 'detailed'].includes(state.method)
          ? state.method
          : 'quick',
        marketValue: typeof state.marketValue === 'number' ? state.marketValue : 0,
        zakatableValue: typeof state.zakatableValue === 'number' ? state.zakatableValue : 0,
        companyData: state.companyData || undefined,
        hawlStatus: {
          isComplete: typeof state.hawlStatus?.isComplete === 'boolean'
            ? state.hawlStatus.isComplete
            : false,
          startDate: state.hawlStatus?.startDate || new Date().toISOString(),
          endDate: state.hawlStatus?.endDate
        },
        displayProperties: {
          currency: typeof state.displayProperties?.currency === 'string'
            ? state.displayProperties.currency
            : 'USD',
          method: state.method === 'quick' ? '30% Rule' : 'CRI Method',
          totalLabel: state.method === 'quick' ? 'Total Investments' : 'Total Company Assets'
        }
      }
    }

    // If version is not recognized, return undefined to trigger default state
    return undefined
  } catch (_error) {
    console.error('Error migrating passive investments state:', _error)
    return undefined
  }
}

export interface StocksSlice {
  // State
  stockValues: StockValues
  stockPrices: StockPrices
  stockHawlMet: boolean
  passiveInvestments?: CurrentPassiveInvestmentState

  // Active Trading Actions
  addActiveStock: (symbol: string, shares: number, manualPrice?: number, currency?: string) => Promise<void>
  updateActiveStock: (symbol: string, shares: number) => Promise<void>
  removeActiveStock: (symbol: string) => void
  updateStockPrices: (targetCurrency?: string, fromCurrency?: string) => Promise<void>

  // Legacy Actions
  setStockValue: (key: keyof StockValues, value: number | boolean) => void
  resetStockValues: () => void
  setStockPrices: (prices: StockPrices) => void
  setStockHawl: (value: boolean) => void

  // Getters
  getTotalStocks: () => number
  getTotalZakatableStocks: () => number
  getActiveStocksBreakdown: () => {
    stocks: StockHolding[]
    total: {
      marketValue: number
      zakatDue: number
    }
  }
  getStocksBreakdown: () => {
    total: number
    zakatable: number
    zakatDue: number
    items: Record<string, {
      value: number
      isZakatable: boolean
      zakatable: number
      zakatDue: number
      label: string
      tooltip: string
      percentage: number
    }>
  }

  // Add Passive Investment Actions
  updatePassiveInvestments: (
    method: 'quick' | 'detailed',
    data?: {
      investments?: Investment[]
      companyData?: {
        cash: number
        receivables: number
        inventory: number
        totalShares: number
        yourShares: number
      }
    },
    calculations?: PassiveCalculations
  ) => void

  // Add loading state
  isLoading: boolean
  lastError: string | null

  // Add nisab check
  meetsNisabThreshold: () => boolean
}

// Initial state
const initialStockValues: StockValues = {
  // Active Trading 
  activeStocks: [],

  // Required fields
  market_value: 0,
  zakatable_value: 0,

  // Optional fields
  total_dividend_earnings: 0,
  fund_value: 0,
  is_passive_fund: false
}

export const createStocksSlice: StateCreator<ZakatState, [], [], any> = (set, get) => ({
  // Add initial state for loading
  isLoading: false,
  lastError: null,

  // Initial state
  stockValues: initialStockValues,
  stockPrices: initialStockPrices,
  stockHawlMet: DEFAULT_HAWL_STATUS.stocks,
  passiveInvestments: {
    version: '2.0',
    method: 'quick',
    investments: [{
      id: Date.now().toString(),
      name: '',
      shares: 0,
      pricePerShare: 0,
      marketValue: 0
    }],
    marketValue: 0,
    zakatableValue: 0,
    hawlStatus: {
      isComplete: false,
      startDate: new Date().toISOString(),
    },
    displayProperties: {
      currency: 'USD',
      method: '30% Rule',
      totalLabel: 'Total Investments'
    }
  },

  // Active Trading Actions
  addActiveStock: async (symbol: string, shares: number, manualPrice?: number, currency?: string) => {
    try {
      if (!symbol || shares <= 0) {
        throw new Error('Invalid symbol or shares')
      }

      // Validate the symbol against API
      if (!manualPrice) {
        const state = get()
        // Use provided currency, or the store's currency, or fallback to USD
        const currentCurrency = currency || state.currency || 'USD'
        const { price, lastUpdated } = await getStockPrice(symbol, currentCurrency)

        // Calculate market value and zakat due
        const marketValue = roundCurrency(shares * price)
        const zakatDue = roundCurrency(marketValue * ZAKAT_RATE)

        // Add to state
        set((state: ZakatState) => {
          // Check if stock already exists
          const existingIndex = state.stockValues.activeStocks.findIndex(
            (s: ActiveStock) => s.symbol.toUpperCase() === symbol.toUpperCase()
          )

          let updatedStocks = [...state.stockValues.activeStocks]

          if (existingIndex >= 0) {
            // Update existing stock
            const existing = updatedStocks[existingIndex]
            updatedStocks[existingIndex] = {
              ...existing,
              shares,
              currentPrice: price,
              marketValue,
              zakatDue,
              lastUpdated: new Date(lastUpdated).toISOString()
            }
          } else {
            // Add new stock
            updatedStocks.push({
              symbol: symbol.toUpperCase(),
              shares,
              currentPrice: price,
              marketValue,
              zakatDue,
              lastUpdated: new Date(lastUpdated).toISOString()
            })
          }

          return {
            stockValues: {
              ...state.stockValues,
              activeStocks: updatedStocks
            }
          }
        })
      } else {
        // Handle manual price entry
        const price = manualPrice
        const marketValue = roundCurrency(shares * price)
        const zakatDue = roundCurrency(marketValue * ZAKAT_RATE)

        // Add to state
        set((state: ZakatState) => {
          // Check if stock already exists
          const existingIndex = state.stockValues.activeStocks.findIndex(
            (s: ActiveStock) => s.symbol.toUpperCase() === symbol.toUpperCase()
          )

          let updatedStocks = [...state.stockValues.activeStocks]

          if (existingIndex >= 0) {
            // Update existing stock
            const existing = updatedStocks[existingIndex]
            updatedStocks[existingIndex] = {
              ...existing,
              shares,
              currentPrice: price,
              marketValue,
              zakatDue,
              lastUpdated: new Date().toISOString()
            }
          } else {
            // Add new stock
            updatedStocks.push({
              symbol: symbol.toUpperCase(),
              shares,
              currentPrice: price,
              marketValue,
              zakatDue,
              lastUpdated: new Date().toISOString()
            })
          }

          return {
            stockValues: {
              ...state.stockValues,
              activeStocks: updatedStocks
            }
          }
        })
      }
    } catch (error) {
      console.error('Failed to add active stock:', error)
      throw error
    }
  },

  updateActiveStock: async (symbol: string, shares: number) => {
    try {
      // Fetch current price
      const { price, lastUpdated } = await getStockPrice(symbol)

      // Ensure we have a valid numeric price
      if (typeof price !== 'number' || !isFinite(price)) {
        throw new Error(`Invalid price received for ${symbol}: ${price}`)
      }

      console.log('Updating stock with price:', { symbol, shares, price })

      // Calculate market value and zakat due
      const marketValue = roundCurrency(shares * price)
      const zakatDue = roundCurrency(marketValue * ZAKAT_RATE)

      set((state) => {
        const updatedStocks = state.stockValues.activeStocks.map((stock) =>
          stock.symbol === symbol
            ? {
              ...stock,
              shares,
              currentPrice: price,
              marketValue,
              zakatDue,
              lastUpdated: new Date(lastUpdated).toISOString()
            }
            : stock
        )

        const totalValue = updatedStocks.reduce((sum, s) => sum + (s.marketValue || 0), 0)

        return {
          stockValues: {
            ...state.stockValues,
            activeStocks: updatedStocks,
            market_value: totalValue,
            zakatable_value: state.stockHawlMet ? totalValue : 0
          }
        }
      })
    } catch (error) {
      console.error('Failed to update active stock:', error)
      throw error
    }
  },

  removeActiveStock: (symbol: string) => {
    set((state) => ({
      stockValues: {
        ...state.stockValues,
        activeStocks: state.stockValues.activeStocks.filter(s => s.symbol !== symbol)
      }
    }))
  },

  updateStockPrices: async (targetCurrency?: string, fromCurrency?: string) => {
    try {
      const state = get();
      const activeStocks = state.stockValues?.activeStocks || [];

      if (activeStocks.length === 0) {
        return; // No stocks to update
      }

      // Get symbols to update
      const symbols = activeStocks.map((stock: ActiveStock) => stock.symbol);

      // Use provided target currency, or the store's currency, or fallback to USD
      const currentCurrency = targetCurrency || state.currency || 'USD';
      console.log(`Updating stock prices to currency: ${currentCurrency}`);

      // Initialize the currency store with proper type
      let currencyStore: CurrencyStore | undefined;

      // Try to get the currency store from the window object if in browser environment
      if (typeof window !== 'undefined' && (window as any).useCurrencyStore) {
        currencyStore = (window as any).useCurrencyStore.getState() as CurrencyStore;
      }

      // Track success/failure counts for logging
      let successCount = 0;
      let failureCount = 0;
      let conversionCount = 0;

      // Fetch updated prices - the API will try to convert currencies
      console.log(`Fetching current stock prices for ${symbols.length} symbols in ${currentCurrency}`);
      const updatedPrices = await getBatchStockPrices(symbols, currentCurrency);
      console.log(`Received ${updatedPrices.length} prices from API`);

      // Update prices in state
      set((state: ZakatState) => {
        const updatedStocks = state.stockValues.activeStocks.map((stock: ActiveStock) => {
          const updated = updatedPrices.find(p => p.symbol.toUpperCase() === stock.symbol.toUpperCase());

          if (updated) {
            successCount++;

            // Check if API conversion was applied
            if (updated.conversionApplied && updated.currency === currentCurrency) {
              console.log(`Stock price for ${stock.symbol} converted to ${currentCurrency} by API`);
              conversionCount++;

              // Calculate market value based on updated price and shares
              const marketValue = roundCurrency(stock.shares * updated.price);
              const zakatDue = roundCurrency(marketValue * ZAKAT_RATE);

              return {
                ...stock,
                currentPrice: updated.price,
                marketValue,
                zakatDue,
                lastUpdated: updated.lastUpdated,
                currency: updated.currency,
                sourceCurrency: updated.sourceCurrency
              };
            } else {
              // API returned price in original currency
              console.log(`Stock price for ${stock.symbol} in original currency: ${updated.currency}`);

              // If we have currency store, try client-side conversion
              if (currencyStore && currencyStore.convertAmount && updated.currency !== currentCurrency) {
                try {
                  const originalPrice = updated.price;
                  const convertedPrice = currencyStore.convertAmount(
                    originalPrice,
                    updated.currency,
                    currentCurrency
                  );

                  if (convertedPrice !== originalPrice) {
                    console.log(`Converted price for ${stock.symbol}: ${originalPrice} ${updated.currency} → ${convertedPrice} ${currentCurrency}`);
                    conversionCount++;

                    // Calculate market value based on converted price
                    const marketValue = roundCurrency(stock.shares * convertedPrice);
                    const zakatDue = roundCurrency(marketValue * ZAKAT_RATE);

                    return {
                      ...stock,
                      currentPrice: convertedPrice,
                      marketValue,
                      zakatDue,
                      lastUpdated: updated.lastUpdated,
                      currency: currentCurrency,
                      sourceCurrency: updated.currency
                    };
                  }
                } catch (conversionError) {
                  console.error(`Failed to convert ${stock.symbol} price:`, conversionError);
                }
              }

              // If no conversion was possible, keep original currency
              const marketValue = roundCurrency(stock.shares * updated.price);
              const zakatDue = roundCurrency(marketValue * ZAKAT_RATE);

              return {
                ...stock,
                currentPrice: updated.price,
                marketValue,
                zakatDue,
                lastUpdated: updated.lastUpdated,
                currency: updated.currency,
                sourceCurrency: updated.sourceCurrency
              };
            }
          } else {
            failureCount++;

            // If we couldn't get an updated price but have stock with currency and price
            // Leave it unchanged
            console.log(`No updated price for ${stock.symbol}, keeping existing data`);
            return stock;
          }
        });

        console.log(`Stock update results: ${successCount} fetched, ${conversionCount} converted, ${failureCount} failed`);

        return {
          stockValues: {
            ...state.stockValues,
            activeStocks: updatedStocks
          },
          currency: currentCurrency // Update global currency
        };
      });

      // Recalculate totals after updating stock prices
      const zakatStore = get();
      if (typeof zakatStore.getTotalStocks === 'function') {
        zakatStore.getTotalStocks();
      }
      if (typeof zakatStore.getTotalZakatableStocks === 'function') {
        zakatStore.getTotalZakatableStocks();
      }

    } catch (error) {
      console.error('Failed to update stock prices:', error);
      throw error;
    }
  },

  // Legacy Actions
  setStockValue: (key: keyof StockValues, value: number | boolean) => {
    set((state) => ({
      stockValues: {
        ...state.stockValues,
        [key]: value
      }
    }))
  },

  resetStockValues: () => {
    set({
      stockValues: {
        ...initialStockValues,
        passiveInvestments: {
          version: '2.0',
          method: 'quick',
          investments: [{
            id: Date.now().toString(),
            name: '',
            shares: 0,
            pricePerShare: 0,
            marketValue: 0
          }],
          marketValue: 0,
          zakatableValue: 0,
          hawlStatus: {
            isComplete: false,
            startDate: new Date().toISOString(),
          },
          displayProperties: {
            currency: 'USD',
            method: '30% Rule',
            totalLabel: 'Total Investments'
          }
        }
      },
      stockHawlMet: DEFAULT_HAWL_STATUS.stocks,
      passiveInvestments: undefined
    })
  },

  setStockPrices: (prices: StockPrices) => set({ stockPrices: prices }),

  setStockHawl: (value: boolean) => set({ stockHawlMet: value }),

  // Getters
  getTotalStocks: () => {
    const state = get()

    // Get active stocks total
    const activeTotal = Array.isArray(state.stockValues?.activeStocks)
      ? state.stockValues.activeStocks.reduce(
        (sum: number, stock: ActiveStock) => sum + (Number.isFinite(stock.marketValue) ? stock.marketValue : 0),
        0
      )
      : 0

    // Get passive investments total from new state structure
    const passiveTotal = state.stockValues?.passiveInvestments?.marketValue || 0

    // Get dividend total
    const dividendTotal = state.stockValues?.total_dividend_earnings || 0

    // Return total, ensuring it's a valid number
    const total = activeTotal + passiveTotal + dividendTotal
    return Number.isFinite(total) ? roundCurrency(total) : 0
  },

  getTotalZakatableStocks: () => {
    const state = get()
    if (!state.stockHawlMet) return 0

    // Get active stocks total (fully zakatable)
    const activeTotal = Array.isArray(state.stockValues?.activeStocks)
      ? state.stockValues.activeStocks.reduce(
        (sum: number, stock: ActiveStock) => sum + (Number.isFinite(stock.marketValue) ? stock.marketValue : 0),
        0
      )
      : 0

    // Get passive investments zakatable amount
    const passiveZakatable = state.stockValues?.passiveInvestments?.zakatableValue || 0

    // Get dividend total (fully zakatable)
    const dividendTotal = state.stockValues?.total_dividend_earnings || 0

    // Return total zakatable amount
    const total = activeTotal + passiveZakatable + dividendTotal
    return Number.isFinite(total) ? roundCurrency(total) : 0
  },

  getActiveStocksBreakdown: () => {
    const state = get()
    const stocks = state.stockValues.activeStocks.map(stock => ({
      symbol: stock.symbol,
      shares: typeof stock.shares === 'number' ? stock.shares : 0,
      currentPrice: typeof stock.currentPrice === 'number' ? stock.currentPrice : 0,
      marketValue: typeof stock.marketValue === 'number' ? stock.marketValue : 0,
      zakatDue: typeof stock.zakatDue === 'number' ? stock.zakatDue : 0
    }))

    const total = {
      marketValue: stocks.reduce((sum, stock) => sum + (isFinite(stock.marketValue) ? stock.marketValue : 0), 0),
      zakatDue: stocks.reduce((sum, stock) => sum + (isFinite(stock.zakatDue) ? stock.zakatDue : 0), 0)
    }

    return { stocks, total }
  },

  getStocksBreakdown: () => {
    const state = get()
    const total = state.getTotalStocks()
    const zakatable = state.getTotalZakatableStocks()
    const zakatDue = roundCurrency(zakatable * ZAKAT_RATE)

    const items: Record<string, {
      value: number
      isZakatable: boolean
      zakatable: number
      zakatDue: number
      label: string
      tooltip: string
      percentage: number
    }> = {}

    // Add active trading stocks
    if (Array.isArray(state.stockValues?.activeStocks) && state.stockValues.activeStocks.length > 0) {
      items.active_trading = {
        value: state.stockValues.activeStocks.reduce((sum, stock) =>
          sum + (Number.isFinite(stock.marketValue) ? stock.marketValue : 0), 0),
        isZakatable: state.stockHawlMet,
        zakatable: state.stockHawlMet ? state.stockValues.activeStocks.reduce((sum, stock) =>
          sum + (Number.isFinite(stock.marketValue) ? stock.marketValue : 0), 0) : 0,
        zakatDue: state.stockHawlMet ? roundCurrency(state.stockValues.activeStocks.reduce((sum, stock) =>
          sum + (Number.isFinite(stock.marketValue) ? stock.marketValue : 0), 0) * ZAKAT_RATE) : 0,
        label: 'Active Trading',
        tooltip: 'Full market value is zakatable',
        percentage: total > 0 ? roundCurrency((state.stockValues.activeStocks.reduce((sum, stock) =>
          sum + (Number.isFinite(stock.marketValue) ? stock.marketValue : 0), 0) / total) * 100) : 0
      }
    }

    // Add passive investments
    if (state.stockValues?.passiveInvestments) {
      const passiveValue = state.stockValues.passiveInvestments.marketValue
      const passiveZakatable = state.stockValues.passiveInvestments.zakatableValue
      const method = state.stockValues.passiveInvestments.method

      items.passive_investments = {
        value: passiveValue,
        isZakatable: state.stockHawlMet,
        zakatable: state.stockHawlMet ? passiveZakatable : 0,
        zakatDue: state.stockHawlMet ? roundCurrency(passiveZakatable * ZAKAT_RATE) : 0,
        label: `Passive Investments (${method === 'quick' ? '30% Rule' : 'CRI Method'})`,
        tooltip: method === 'quick'
          ? '30% of market value is zakatable'
          : 'Based on company financials',
        percentage: total > 0 ? roundCurrency((passiveValue / total) * 100) : 0
      }
    }

    // Add dividend earnings
    const dividendValue = state.stockValues?.total_dividend_earnings || 0
    if (dividendValue > 0) {
      items.dividends = {
        value: dividendValue,
        isZakatable: state.stockHawlMet,
        zakatable: state.stockHawlMet ? dividendValue : 0,
        zakatDue: state.stockHawlMet ? roundCurrency(dividendValue * ZAKAT_RATE) : 0,
        label: 'Dividend Earnings',
        tooltip: 'Full dividend amount is zakatable',
        percentage: total > 0 ? roundCurrency((dividendValue / total) * 100) : 0
      }
    }

    // Add default item if no stocks at all
    if (Object.keys(items).length === 0) {
      items.stocks = {
        value: 0,
        isZakatable: false,
        zakatable: 0,
        zakatDue: 0,
        label: 'Stocks',
        tooltip: 'No stocks added yet',
        percentage: 0
      }
    }

    return {
      total,
      zakatable,
      zakatDue,
      items
    }
  },

  updatePassiveInvestments: (
    method: 'quick' | 'detailed',
    data?: {
      investments?: Investment[]
      companyData?: {
        cash: number
        receivables: number
        inventory: number
        totalShares: number
        yourShares: number
      }
    },
    calculations?: PassiveCalculations
  ) => {
    try {
      const currentState = get().stockValues.passiveInvestments
      const newState: PassiveInvestmentState = {
        version: '2.0',
        method,
        investments: Array.isArray(data?.investments) ? data.investments : (currentState?.investments || []),
        marketValue: typeof calculations?.marketValue === 'number'
          ? calculations.marketValue
          : (currentState?.marketValue || 0),
        zakatableValue: typeof calculations?.zakatableValue === 'number'
          ? calculations.zakatableValue
          : (currentState?.zakatableValue || 0),
        hawlStatus: currentState?.hawlStatus || {
          isComplete: false,
          startDate: new Date().toISOString(),
        },
        displayProperties: {
          currency: currentState?.displayProperties?.currency || 'USD',
          method: method === 'quick' ? '30% Rule' : 'CRI Method',
          totalLabel: method === 'quick' ? 'Total Investments' : 'Total Company Assets'
        }
      }

      // If we have company data, add it to the state properly
      if (data?.companyData) {
        // Create a separate companyData object to add to state
        const companyDataToAdd = {
          cash: data.companyData.cash,
          receivables: data.companyData.receivables,
          inventory: data.companyData.inventory,
          totalShares: data.companyData.totalShares,
          yourShares: data.companyData.yourShares,
          displayProperties: {
            currency: currentState?.displayProperties?.currency || 'USD',
            sharePercentage: data.companyData.yourShares / data.companyData.totalShares * 100
          }
        };

        // Handle this separately since it's not in the type
        (newState as any).companyData = companyDataToAdd;
      }

      const migratedState = migratePassiveInvestments(newState)
      if (!migratedState) {
        console.error('Failed to create valid passive investments state')
        return
      }

      // Update state and trigger recalculations
      const updatedState: Partial<ZakatState> = {
        stockValues: {
          ...get().stockValues,
          passiveInvestments: migratedState,
          // Update legacy fields for compatibility
          market_value: migratedState.marketValue,
          zakatable_value: migratedState.zakatableValue
        },
        // Use a type assertion to avoid the type error
        passiveInvestments: migratedState as any
      }

      // Get updated totals
      const stockAsset = getAssetType('stocks')
      if (stockAsset) {
        const newTotal = stockAsset.calculateTotal(updatedState.stockValues!, get().stockPrices)
        const newZakatable = stockAsset.calculateZakatable(
          updatedState.stockValues!,
          get().stockPrices,
          get().stockHawlMet
        )

        if (updatedState.stockValues) {
          updatedState.stockValues.market_value = newTotal
          updatedState.stockValues.zakatable_value = newZakatable
        }
      }

      // Instead of returning the state directly, use set() with the state
      set(updatedState)
    } catch (error) {
      console.error('Error updating passive investments:', error)
    }
  },

  meetsNisabThreshold: () => {
    const state = get()

    // Get metal prices from the metals slice
    const metalPrices = state.metalPrices || { gold: 0, silver: 0 }

    // Calculate nisab thresholds
    const goldNisab = NISAB.GOLD * metalPrices.gold
    const silverNisab = NISAB.SILVER * metalPrices.silver

    // Use the lower of the two nisab values
    const nisabThreshold = Math.min(goldNisab, silverNisab)

    // Get total stock value
    const totalStockValue = state.getTotalStocks()

    return totalStockValue >= nisabThreshold
  }
}) 