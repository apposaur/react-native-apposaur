# React Native Apposaur SDK

A React Native SDK for integrating Apposaur's referral and rewards system into your iOS applications. This SDK provides functionality for managing referral codes, user registration, purchase attribution, and reward redemption.

## Features

- **Referral Code Management**: Validate and manage referral codes
- **User Registration**: Register users with referral attribution
- **Purchase Attribution**: Track and attribute purchases to referral sources
- **Rewards System**: Get and redeem reward offers
- **In-App Purchase Integration**: Seamless integration with Apple's IAP system
- **iOS Only**: Currently supports iOS platform only

## Installation

```bash
npm install react-native-apposaur
# or
yarn add react-native-apposaur
```

### Dependencies

This SDK requires the following peer dependencies:
- `react-native-iap`: For in-app purchase functionality
- `@react-native-async-storage/async-storage`: For local data persistence

## Quick Start

### 1. Initialize the SDK

```typescript
import ApposaurSDK from 'react-native-apposaur';

// Initialize with your API key
await ApposaurSDK.initialize('your-api-key-here');
```

### 2. Validate Referral Codes

```typescript
// Validate a referral code
const isValid = await ApposaurSDK.validateReferralCode({
  code: 'REFERRAL123'
});

if (isValid) {
  console.log('Referral code is valid');
} else {
  console.log('Invalid referral code');
}
```

### 3. Register Users

```typescript
// Register a user (with optional Apple subscription ID)
await ApposaurSDK.registerUser({
  user_id: 'user123',
});
```

### 4. Attribute Purchases

```typescript
// Attribute a purchase to track referral conversions
await ApposaurSDK.attributePurchase(
  'product_id_here',
  'transaction_id_here'
);
```

### 5. Get User's Referral Code

```typescript
// Get the referral code for the registered user
const referralCode = await ApposaurSDK.getRegisteredUserReferralCode();
console.log('User referral code:', referralCode);
```

### 6. Get User's Referrals

```typescript
// Get the list of referrals made by the current user
const referralsData = await ApposaurSDK.getReferrals();
console.log('User referrals:', referralsData.referrals);

// Each referral contains:
// - referral_to: Obfuscated User ID who was referred
// - status: The current status of the referral (Accepted, Referred)
```

### 7. Manage Rewards

```typescript
// Get available rewards for the user
const rewards = await ApposaurSDK.getRewards();
console.log('Available rewards:', rewards.rewards);

// Redeem a reward offer
await ApposaurSDK.redeemRewardOffer('reward_id_here');
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email contact@apposaur.io or visit [https://apposaur.io](https://apposaur.io).
