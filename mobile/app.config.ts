/// <reference types="node" />
import { existsSync } from 'fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json. Firebase config (needed for Android push notifications) is optional:
// drop google-services.json next to this file and it is picked up on the next build.
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServices = './google-services.json';
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(existsSync(googleServices) ? { googleServicesFile: googleServices } : {}),
    },
  };
};
