import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_HEADER_KEY,
  BASE_URL,
  SDK_PLATFORM_HEADER_KEY,
  SDK_REFERRAL_CODE_KEY,
  SDK_REFERRED_BY_USER_ID_KEY,
  SDK_APP_USER_CODE_KEY,
  SDK_APP_USER_ID_KEY,
  SDK_PROCESSED_TRANSACTIONS_KEY,
} from './constant';
import {
  getAvailablePurchases,
  initConnection,
  requestSubscription,
  type RequestSubscription,
  getProducts,
} from 'react-native-iap';

export interface ValidateAppKeyResponse {
  valid: boolean;
}

interface RegisterSDKUserRequest {
  user_id: string;
  apple_subscription_original_transaction_id?: string;
}

export interface RegisterSDKUserResponse {
  app_id: string;
  external_user_id: string;
  app_user_id: string;
  code: string;
  apple_subscription_original_transaction_id?: string;
  created_at?: string;
}

export interface ValidateReferralCodeRequest {
  code: string;
}

export interface GetRewardsItem {
  app_reward_id: string;
  offer_name: string;
}

export interface GetRewardsResponse {
  rewards: GetRewardsItem[];
}

export interface SignedOffer {
  offerId: string;
  keyIdentifier: string;
  nonce: string;
  signature: string;
  timestamp: number;
}

export interface RedeemRewardOfferRequest {
  app_reward_id: string;
}

export interface RedeemRewardOfferResponse {
  success: boolean;
}

class ApposaurSDK {
  private static instance: ApposaurSDK;
  private headers: HeadersInit;
  private activeSubscriptionProductId: string = '';

  private constructor() {
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  public static getInstance(): ApposaurSDK {
    if (!ApposaurSDK.instance) {
      ApposaurSDK.instance = new ApposaurSDK();
    }
    return ApposaurSDK.instance;
  }

  public async initialize(apiKey: string): Promise<void> {
    if (Platform.OS === 'android') {
      throw new Error('Android is not supported');
    }
    this.headers = {
      ...this.headers,
      [API_HEADER_KEY]: apiKey,
      [SDK_PLATFORM_HEADER_KEY]: Platform.OS,
    };
    try {
      // initialize iap
      const connected = await initConnection();
      if (!connected) {
        throw new Error('Failed to initialize In App Purchase');
      }
      await this.validateAPIKey();
      try {
        this.activeSubscriptionProductId = await this.getActiveSubscriptionProductId();
      } catch (e) {
        // ignore error
      }
    } catch (e) {
      console.error('Error initializing ApposaurSDK', e);
      throw e;
    }
  }

  private async makeRequest(
    endpoint: string,
    method: string,
    body?: any,
    retryCount: number = 2,
  ): Promise<any> {
    
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (retryCount > 0) {
        console.warn('Request failed, retrying..', error);
        const delay = 500; // 0.5s
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, method, body, retryCount - 1);
      } else {
        console.error(`Request failed after ${retryCount} attempts:`, error);
        throw error;
      }
    }
  }

  private async validateAPIKey(): Promise<ValidateAppKeyResponse> {
    try {
      const data = await this.makeRequest('/referral/key', 'POST');
      if (!data.valid) {
        throw new Error('Invalid API key');
      }
      return data;
    } catch (e) {
      console.error('Error verifying API key:', e);
      throw new Error('Failed to verify API key');
    }
  }

  public async validateReferralCode(
    request: ValidateReferralCodeRequest,
  ): Promise<boolean> {
    try {
      let requestBody = {
        code: request.code,
      };
      let data = await this.makeRequest(
        '/referral/validate',
        'POST',
        requestBody,
      );
      if (!data.referred_app_user_id) {
        return false;
      }
      await AsyncStorage.setItem(SDK_REFERRAL_CODE_KEY, request.code);
      await AsyncStorage.setItem(
        SDK_REFERRED_BY_USER_ID_KEY,
        data.referred_app_user_id,
      );
      return true;
    } catch (e) {
      console.error('Error validating referral code:', e);
      throw new Error('Failed to validate Referral Code');
    }
  }

  public async clearReferralCode(): Promise<void> {
    await AsyncStorage.removeItem(SDK_REFERRAL_CODE_KEY);
    await AsyncStorage.removeItem(SDK_REFERRED_BY_USER_ID_KEY);
  }

  public async registerUser(request: RegisterSDKUserRequest): Promise<void> {
    const referredByUserId = await AsyncStorage.getItem(
      SDK_REFERRED_BY_USER_ID_KEY,
    );

    let apiRequest = {
      external_user_id: request.user_id,
      original_transaction_id:
        request.apple_subscription_original_transaction_id,
      referred_app_user_id: referredByUserId,
    };

    try {
      const registerUserResponse = await this.makeRequest(
        '/referral/register',
        'POST',
        apiRequest,
      );
      await AsyncStorage.setItem(
        SDK_APP_USER_ID_KEY,
        registerUserResponse.app_user_id,
      );
      await AsyncStorage.setItem(
        SDK_APP_USER_CODE_KEY,
        registerUserResponse.code,
      );
    } catch (e) {
      console.error('Error registering user:', e);
    }
  }

  public async getRegisteredUserReferralCode(): Promise<string | undefined> {
    try {
      const code = await AsyncStorage.getItem(SDK_APP_USER_CODE_KEY);
      return code ?? undefined;
    } catch (e) {
      console.error('Error getting registered user referral code:', e);
      throw new Error('Failed to get registered user referral code');
    }
  }

  public async attributePurchase(
    productId: string,
    transactionId: string,
  ): Promise<void> {
    try {
      const appUserId = await AsyncStorage.getItem(SDK_APP_USER_ID_KEY);
      if (!appUserId) {
        return Promise.resolve();
      }

      const processedTransactions = JSON.parse(
        (await AsyncStorage.getItem(SDK_PROCESSED_TRANSACTIONS_KEY)) || '[]',
      );
      if (processedTransactions.includes(transactionId)) {
        return Promise.resolve();
      }

      const attributePurchaseRequest = {
        app_user_id: appUserId,
        product_id: productId,
        transaction_id: transactionId,
      };

      try {
        this.activeSubscriptionProductId = productId;
      } catch (e) {
        // ignore error
      }

      await this.sendPurchaseEvent(attributePurchaseRequest);

      processedTransactions.push(transactionId);
      await AsyncStorage.setItem(
        SDK_PROCESSED_TRANSACTIONS_KEY,
        JSON.stringify(processedTransactions),
      );
    } catch (e) {
      console.error('Error handling purchase:', e);
    }
  }

  private async sendPurchaseEvent(
    attributePurchaseRequest: any,
  ): Promise<void> {
    try {
      await this.makeRequest(
        '/referral/purchase',
        'POST',
        attributePurchaseRequest,
      );
    } catch (e) {
      console.error('Error sending purchase event:', e);
    }
  }

  private async getActiveSubscriptionProductId(): Promise<string> {
    const purchases = await getAvailablePurchases();
    if (purchases.length === 0) {
      throw new Error('No purchases found');
    }
    return purchases[0]?.productId ?? '';
  }

  public async getRewards(): Promise<GetRewardsResponse> {
    try {
      const appUserId = await AsyncStorage.getItem(SDK_APP_USER_ID_KEY);
      if (!appUserId) {
        return Promise.resolve({rewards: []});
      }
      if (!this.activeSubscriptionProductId) {
        return Promise.resolve({rewards: []});
      }
      const url = `/referral/rewards?app_user_id=${appUserId}&product_id=${this.activeSubscriptionProductId}`;
      const rewards = await this.makeRequest(url, 'GET');
      return rewards;
    } catch (e) {
      console.error('Error getting rewards:', e);
      throw new Error('Failed to get rewards');
    }
  }

  public async redeemRewardOffer(rewardId: string): Promise<void> {
    try {
      const appUserId = await AsyncStorage.getItem(SDK_APP_USER_ID_KEY);
      if (!appUserId) {
        throw new Error('App user ID not found');
      }
      if (!this.activeSubscriptionProductId) {
        throw new Error('No active subscription found');
      }
      await getProducts({skus: [this.activeSubscriptionProductId]});
      const signRewardOfferRequest = {
        app_reward_id: rewardId,
        product_id: this.activeSubscriptionProductId,
        app_user_id: appUserId,
      };
      const signedOffer = await this.makeRequest(
        '/referral/rewards/sign',
        'POST',
        signRewardOfferRequest,
      );
      // call iap purchase
      const purchaseOptions: RequestSubscription = {
        sku: this.activeSubscriptionProductId,
        appAccountToken: appUserId,
        withOffer: {
          identifier: signedOffer.offerId,
          keyIdentifier: signedOffer.keyIdentifier,
          nonce: signedOffer.nonce,
          signature: signedOffer.signature,
          timestamp: signedOffer.timestamp,
        },
      };
      const purchaseResult = await requestSubscription(purchaseOptions);
      if (purchaseResult && 'transactionId' in purchaseResult) {
        // mark as redeemed
        await this.makeRequest('/referral/rewards/redeem', 'POST', {
          app_reward_id: rewardId,
        });
      }
    } catch (e) {
      console.error('Error signing reward offer:', e);
      throw new Error('Failed to sign reward offer');
    }
  }
}

export default ApposaurSDK.getInstance();
